'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Check } from 'lucide-react';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Divider } from '@/components/ui/Card';
import { Field, FieldError, Hint, Input, Label } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { isFirebaseConfigured } from '@/lib/firebase/client';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { isFirebaseBackend, isSupabaseBackend } from '@/lib/backend';
import { getAuthApi } from '@/lib/auth-api';

/* ============================================================================
   SIGN-IN FORM
   ----------------------------------------------------------------------------
   Firebase Auth does the credential exchange; the resulting ID token is POSTed
   once to `/api/auth/session`, which mints an httpOnly session cookie with the
   Admin SDK. The token itself never goes into localStorage — the cookie is not
   readable from JavaScript at all, so an XSS cannot lift a bearer credential.

   `router.refresh()` after a successful sign-in is not optional: the app shell is
   a Server Component that reads the session cookie, and without the refresh the
   client navigates to a dashboard rendered for an anonymous viewer.

   Errors render inline, per Firebase error code. A raw code tells a user nothing,
   so `src/lib/firebase/auth.ts` maps each one to a sentence they can act on.
   ========================================================================== */

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState<'email' | 'google' | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [resetOpen, setResetOpen] = React.useState(false);

  /* `next` is validated as a same-origin path before use. An unvalidated
     redirect target on a login page is a phishing primitive. */
  const next = React.useMemo(() => {
    const raw = params.get('next');
    return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/dashboard';
  }, [params]);

  const repair = params.get('repair') === '1';
  const registered = params.get('registered') === '1';

  const finish = () => {
    router.push(next);
    router.refresh();
  };

  const submitEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy('email');
    setError(null);

    const auth = await getAuthApi();
    const result = await auth.signInWithEmail(email.trim(), password);

    if (result.ok) finish();
    else {
      setError(result.message ?? 'Could not sign you in.');
      setBusy(null);
    }
  };

  const submitGoogle = async () => {
    setBusy('google');
    setError(null);

    const auth = await getAuthApi();
    const result = await auth.signInWithGoogle();

    if (result.ok) finish();
    else {
      setError(result.message ?? 'Could not sign you in with Google.');
      setBusy(null);
    }
  };

  if (isSupabaseBackend ? !isSupabaseConfigured : !isFirebaseConfigured) {
    return (
      <Alert tone="warning" icon={AlertTriangle}>
        {isSupabaseBackend ? 'Supabase' : 'Firebase'} is not configured, so sign-in is unavailable. Copy{' '}
        <code className="font-mono text-12">.env.example</code> to{' '}
        <code className="font-mono text-12">.env.local</code> and fill in the{' '}
        <code className="font-mono text-12">{(isSupabaseBackend ? 'NEXT_PUBLIC_SUPABASE' : 'NEXT_PUBLIC_FIREBASE') + '_*'}</code>{' '}
        values.
      </Alert>
    );
  }

  return (
    <>
      {registered ? (
        <Alert tone="success" icon={Check} className="mb-5">
          Account created. Sign in to continue — and check your inbox for the verification link, which you will
          need before your first withdrawal.
        </Alert>
      ) : null}

      {repair ? (
        <Alert tone="info" className="mb-5">
          Sign in again to finish setting up your account. Nothing was lost.
        </Alert>
      ) : null}

      <form className="mt-2 flex flex-col gap-4" onSubmit={submitEmail}>
        <Field>
          <Label htmlFor="login-email">Email</Label>
          <Input
            id="login-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(error)}
            required
          />
        </Field>

        <Field>
          <div className="flex items-center justify-between">
            <Label htmlFor="login-password">Password</Label>
            <button
              type="button"
              onClick={() => setResetOpen(true)}
              className="text-12 text-text-3 transition-colors duration-fast ease-out hover:text-text-2"
            >
              Forgot password?
            </button>
          </div>
          <Input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(error)}
            required
          />
          {error ? <FieldError>{error}</FieldError> : null}
        </Field>

        <Checkbox defaultChecked>Keep me signed in on this device</Checkbox>

        <Button type="submit" variant="primary" size="lg" block disabled={busy !== null}>
          {busy === 'email' ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3">
        <Divider className="flex-1" />
        <span className="text-11 uppercase tracking-wide text-text-3">or</span>
        <Divider className="flex-1" />
      </div>

      <Button variant="secondary" size="lg" block onClick={submitGoogle} disabled={busy !== null}>
        <GoogleMark />
        {busy === 'google' ? 'Opening Google…' : 'Continue with Google'}
      </Button>

      <p className="mt-6 text-center text-13 text-text-3">
        New here?{' '}
        <Link href="/register" className="font-semibold text-mint underline underline-offset-2">
          Create an account
        </Link>
      </p>

      <ResetModal open={resetOpen} onClose={() => setResetOpen(false)} initialEmail={email} />
    </>
  );
}

function ResetModal({
  open,
  onClose,
  initialEmail,
}: {
  open: boolean;
  onClose: () => void;
  initialEmail: string;
}) {
  const [email, setEmail] = React.useState(initialEmail);
  const [state, setState] = React.useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) setEmail(initialEmail);
  }, [open, initialEmail]);

  const send = async () => {
    setState('sending');
    setError(null);
    const auth = await getAuthApi();
    const result = await auth.resetPassword(email.trim());
    if (result.ok) setState('sent');
    else {
      setError(result.message ?? 'Could not send that email.');
      setState('idle');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Reset your password"
      description="We send a link to your email. We never see or store your password."
    >
      {state === 'sent' ? (
        <div className="flex flex-col gap-4">
          <Alert tone="success" icon={Check}>
            Reset link sent to <strong>{email}</strong>. It expires in an hour. Check your spam folder if it does
            not arrive within a few minutes.
          </Alert>
          <Button variant="secondary" block onClick={onClose}>
            Back to sign in
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Field>
            <Label htmlFor="reset-email">Email</Label>
            <Input
              id="reset-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={Boolean(error)}
            />
            {error ? <FieldError>{error}</FieldError> : null}
            <Hint>Use the address you signed up with.</Hint>
          </Field>
          <Button variant="primary" block onClick={send} disabled={state === 'sending' || !email.trim()}>
            {state === 'sending' ? 'Sending…' : 'Send reset link'}
          </Button>
        </div>
      )}
    </Modal>
  );
}

/** Google's mark is a brand asset, not part of our icon set, so it is inlined
    here rather than approximated with a lucide glyph. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px]">
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.54 5.54 0 0 1-2.4 3.63v3h3.86c2.26-2.09 3.57-5.17 3.57-8.87z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.95-2.91l-3.87-3c-1.07.72-2.44 1.15-4.08 1.15-3.13 0-5.78-2.11-6.73-4.96H1.28v3.09A12 12 0 0 0 12 24z"
      />
      <path fill="#FBBC05" d="M5.27 14.28a7.2 7.2 0 0 1 0-4.56V6.63H1.28a12 12 0 0 0 0 10.74l3.99-3.09z" />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.63l3.99 3.09C6.22 6.86 8.87 4.75 12 4.75z"
      />
    </svg>
  );
}
