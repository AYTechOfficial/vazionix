'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Lock, ShieldCheck } from 'lucide-react';

import { cn } from '@/lib/utils';
import { brand } from '@/lib/brand';
import { ROLES, ADMIN_ROLES } from '@/lib/admin/rbac';
import { isFirebaseConfigured } from '@/lib/firebase/client';
import { isFirebaseBackend, isSupabaseBackend } from '@/lib/backend';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { getAuthApi } from '@/lib/auth-api';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field, FieldError, Hint, Input, Label } from '@/components/ui/Input';
import { Pill } from '@/components/ui/Pill';

/* ============================================================================
   STAFF SIGN-IN
   ----------------------------------------------------------------------------
   The same Firebase Auth exchange the user-facing app uses, because staff are
   Firebase users with extra custom claims rather than a parallel identity system.
   One auth system means one revocation path.

     1. `signInWithEmail` authenticates and POSTs the ID token to
        `/api/auth/session`, which verifies `auth_time` is recent, mints the
        httpOnly session cookie, and sets the non-httpOnly role-hint cookie from
        the token's custom claims.
     2. The console is entered. `requirePermission()` on every page re-reads the
        signed cookie and refuses if the claims do not hold the permission.

   A non-staff account gets through step 1 and is then bounced by the guard, so the
   copy says that plainly rather than pretending the password was wrong.

   TWO-FACTOR
   Staff accounts are expected to have TOTP enrolled, and `getAdminSession()`
   refuses a token without an `mfa` claim unless `STAFF_REQUIRE_MFA=false` is set
   for the initial bootstrap. Firebase's own multi-factor resolver handles the
   challenge during `signInWithEmailAndPassword`, so there is no separate code field
   here to get out of step with it.
   ========================================================================== */

export function AdminLoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  /* Validated as a same-origin admin path before use: an open redirect on a login
     page is a phishing primitive. */
  const target = React.useMemo(
    () => (next.startsWith('/admin') && !next.startsWith('//') ? next : '/admin'),
    [next],
  );

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError('Enter your work email address.');
      return;
    }

    setPending(true);

    const auth = await getAuthApi();
    const result = await auth.signInWithEmail(email.trim(), password);

    if (!result.ok) {
      setError(result.message ?? 'Could not sign you in.');
      setPending(false);
      return;
    }

    /* The session cookie is set. Whether this account is staff is decided by the
       guard on the next request, which is why we navigate rather than branching
       here — the client has no trustworthy view of its own claims. */
    router.push(target);
    router.refresh();
  };

  return (
    <div className="ambient-mesh grid min-h-screen place-items-center px-6 py-12">
      <div className="glass w-full max-w-[440px] rounded-lg p-8 max-sm:p-6">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid size-[38px] flex-none place-items-center rounded-[11px] border border-danger-line bg-danger-dim text-danger">
            <Lock aria-hidden="true" className="size-5" />
          </span>
          <span className="flex flex-col leading-[1.15]">
            <strong className="font-display text-16 tracking-[-0.03em]">{brand.name}</strong>
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-3">
              Staff console
            </span>
          </span>
        </div>

        <h1 className="text-24 font-semibold tracking-snug">Sign in to admin</h1>
        <p className="mb-5 mt-2 text-13 text-text-3">
          Staff accounts only. Access is gated by Firebase custom claims and every action is audit-logged.
        </p>

        <Alert tone="warning" icon={ShieldCheck} className="mb-5">
          This console is separate from <strong>{brand.domain}</strong>. Staff never ask for your password and
          support can never move funds.
        </Alert>

        {(isSupabaseBackend ? !isSupabaseConfigured : !isFirebaseConfigured) ? (
          <Alert tone="danger" className="mb-5">
            {(isSupabaseBackend ? 'Supabase' : 'Firebase')} is not configured, so nobody can sign in. Set the{' '}
            <code className="font-mono text-12">{(isSupabaseBackend ? 'NEXT_PUBLIC_SUPABASE' : 'NEXT_PUBLIC_FIREBASE') + '_*'}</code>{' '}
            values and{' '}
            <code className="font-mono text-12">{isSupabaseBackend ? 'SUPABASE_SERVICE_ROLE_KEY' : 'FIREBASE_SERVICE_ACCOUNT_KEY'}</code>, then bootstrap the first
            admin.
          </Alert>
        ) : null}

        <form onSubmit={onSubmit} noValidate>
          <Field className="mb-4">
            <Label htmlFor="al-email">Work email</Label>
            <Input
              id="al-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={Boolean(error)}
            />
          </Field>

          <Field className="mb-5">
            <Label htmlFor="al-pass">Password</Label>
            <Input
              id="al-pass"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={Boolean(error)}
            />
            <Hint>
              If your account has two-factor enrolled, the authenticator prompt appears after this step.
            </Hint>
          </Field>

          {error ? (
            <FieldError className="mb-4" role="alert">
              {error}
            </FieldError>
          ) : null}

          <Button type="submit" variant="primary" size="lg" block disabled={pending || (isSupabaseBackend ? !isSupabaseConfigured : !isFirebaseConfigured)}>
            <Lock aria-hidden="true" />
            {pending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <p className="mt-4 text-11 leading-body text-text-3">
          Signing in with an account that is not staff will land you on the refusal page. That is expected — the
          session is valid, the claims are not.
        </p>

        <hr className="my-5 h-px border-0 bg-line" />

        <p className="mb-3 text-11 text-text-3">
          Five roles. The console you see is built from what your role holds — these are the shapes it takes:
        </p>
        <div className="flex flex-wrap gap-2">
          {ADMIN_ROLES.map((r) => (
            <Pill key={r} tone={ROLES[r].tone} title={ROLES[r].desc}>
              {ROLES[r].label}
              <span className={cn('ml-1 font-mono tabular opacity-70')}>{ROLES[r].perms.length}</span>
            </Pill>
          ))}
        </div>
      </div>
    </div>
  );
}
