'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Gift } from 'lucide-react';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Divider } from '@/components/ui/Card';
import { Field, FieldError, Hint, Input, Label } from '@/components/ui/Input';
import { isFirebaseConfigured } from '@/lib/firebase/client';
import { brand } from '@/lib/brand';

/* ============================================================================
   REGISTRATION FORM
   ----------------------------------------------------------------------------
   Four fields and a referral code. The `/users/{uid}` profile is NOT created
   here — the client posts its ID token to `/api/auth/session`, which creates the
   profile server-side with the Admin SDK. The document holds `balance`, `level`
   and `referredBy`, and a client that could create its own would seed itself a
   balance and name its own referrer.

   THE REFERRAL CODE IS CAPTURED, NOT TRUSTED
   It arrives from the `?r=` parameter (or is typed) and is sent as a CODE. The
   server resolves it to a uid. Nothing here can claim to have been referred by a
   uid, because it never sends one.

   Password strength is checked client-side as feedback and enforced by Firebase.
   The 10-character floor is deliberate: a passphrase beats a short complex string,
   and complexity rules push people toward `Password1!`.
   ========================================================================== */

const MIN_PASSWORD = 10;

export function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();

  const [username, setUsername] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [referral, setReferral] = React.useState('');
  const [accepted, setAccepted] = React.useState(false);
  const [busy, setBusy] = React.useState<'email' | 'google' | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  /* The code can arrive on this page directly (`/register?r=abc`) or have been
     captured by middleware into a first-party cookie when the visitor landed.
     Either way it is only ever a code — the server resolves it to a uid. */
  React.useEffect(() => {
    const fromQuery = params.get('r') ?? params.get('ref');
    if (fromQuery) {
      setReferral(fromQuery);
      return;
    }
    const match = document.cookie.match(new RegExp(`(?:^|; )${brand.slug}-ref=([^;]*)`));
    if (match?.[1]) setReferral(decodeURIComponent(match[1]));
  }, [params]);

  const usernameValid = /^[a-zA-Z0-9_.]{3,20}$/.test(username);
  const passwordValid = password.length >= MIN_PASSWORD;
  const canSubmit = usernameValid && passwordValid && email.includes('@') && accepted && busy === null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    setBusy('email');
    setError(null);

    const { registerWithEmail } = await import('@/lib/firebase/auth');
    const result = await registerWithEmail(
      email.trim(),
      password,
      username.trim(),
      referral.trim() || undefined,
    );

    if (result.ok) {
      /* Clear the attribution cookie: it has done its job, and leaving it set
         means a second account from the same browser inherits the referrer. */
      document.cookie = `${brand.slug}-ref=; path=/; max-age=0`;
      router.push('/dashboard');
      router.refresh();
    } else {
      setError(result.message ?? 'Could not create that account.');
      setBusy(null);
    }
  };

  const withGoogle = async () => {
    if (!accepted) {
      setError('Accept the terms first.');
      return;
    }
    setBusy('google');
    setError(null);

    const { signInWithGoogle } = await import('@/lib/firebase/auth');
    const result = await signInWithGoogle();

    if (result.ok) {
      router.push('/dashboard');
      router.refresh();
    } else {
      setError(result.message ?? 'Could not sign you up with Google.');
      setBusy(null);
    }
  };

  if (!isFirebaseConfigured) {
    return (
      <Alert tone="warning" icon={AlertTriangle}>
        Firebase is not configured, so registration is unavailable. Copy{' '}
        <code className="font-mono text-12">.env.example</code> to{' '}
        <code className="font-mono text-12">.env.local</code> and fill in the{' '}
        <code className="font-mono text-12">NEXT_PUBLIC_FIREBASE_*</code> values.
      </Alert>
    );
  }

  return (
    <>
      <form className="mt-2 flex flex-col gap-4" onSubmit={submit}>
        <Field>
          <Label htmlFor="reg-username">Username</Label>
          <Input
            id="reg-username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_.]/g, ''))}
            aria-invalid={Boolean(username) && !usernameValid}
            maxLength={20}
            required
          />
          {username && !usernameValid ? (
            <FieldError>3–20 characters: letters, numbers, underscore or dot.</FieldError>
          ) : (
            <Hint>Shown on leaderboards and to anyone you refer. It can be changed later.</Hint>
          )}
        </Field>

        <Field>
          <Label htmlFor="reg-email">Email</Label>
          <Input
            id="reg-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Hint>We send a verification link. You will need it before your first withdrawal.</Hint>
        </Field>

        <Field>
          <Label htmlFor="reg-password">Password</Label>
          <Input
            id="reg-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(password) && !passwordValid}
            required
          />
          {password && !passwordValid ? (
            <FieldError>At least {MIN_PASSWORD} characters.</FieldError>
          ) : (
            <Hint>
              {MIN_PASSWORD} characters minimum. A passphrase of three unrelated words beats a short complex
              string.
            </Hint>
          )}
        </Field>

        <Field>
          <Label htmlFor="reg-referral">Referral code (optional)</Label>
          <Input
            id="reg-referral"
            mono
            value={referral}
            onChange={(e) => setReferral(e.target.value.trim())}
            placeholder="Paste a code if someone invited you"
          />
        </Field>

        <Checkbox checked={accepted} onChange={(e) => setAccepted(e.target.checked)}>
          I am over 18, this is my only account, and I accept that automation, VPNs and multi-accounting forfeit
          the balance.
        </Checkbox>

        {error ? (
          <Alert tone="danger" icon={AlertTriangle} className="text-12">
            {error}
          </Alert>
        ) : null}

        <Button type="submit" variant="primary" size="lg" block disabled={!canSubmit}>
          {busy === 'email' ? 'Creating your account…' : 'Create account'}
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3">
        <Divider className="flex-1" />
        <span className="text-11 uppercase tracking-wide text-text-3">or</span>
        <Divider className="flex-1" />
      </div>

      <Button variant="secondary" size="lg" block onClick={withGoogle} disabled={busy !== null}>
        <GoogleMark />
        {busy === 'google' ? 'Opening Google…' : 'Continue with Google'}
      </Button>

      <p className="mt-6 text-center text-13 text-text-3">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-mint underline underline-offset-2">
          Sign in
        </Link>
      </p>

      <Alert tone="success" icon={Gift} className="mt-6">
        <span className="text-12">
          A welcome bonus lands in your balance the moment the account exists, and it shows up in Transactions
          like every other credit.
        </span>
      </Alert>
    </>
  );
}

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
