'use client';

import { getBrowserSupabase } from './client';

/* ============================================================================
   SUPABASE AUTH (client)
   ----------------------------------------------------------------------------
   Drop-in replacement for `src/lib/firebase/auth.ts` with the SAME exported
   function surface and AuthResult shape, so LoginForm / RegisterForm /
   AccountSettings / SessionProvider only change their import line to the
   backend router `src/lib/auth-api.ts`.

   SESSION MODEL DIFFERENCE
   Firebase exchanged a client ID token for a server-minted httpOnly cookie.
   Supabase's browser client (via @supabase/ssr) writes its own auth cookies
   automatically on sign-in, encrypted and httpOnly by default, with middleware
   refreshing them. So there is no separate `establishSession` POST — the
   browser client manages the cookie, and auth state is read server-side from
   the same cookie in src/lib/supabase/server.ts + src/server/session.ts.
   ========================================================================== */

export interface AuthResult {
  ok: boolean;
  /** Provider error code when present, e.g. 'invalid_credentials'. */
  code?: string;
  message?: string;
  user?: {
    id: string;
    email: string | null;
  };
}

/** Supabase's own error messages are already user-actionable; these are a few
    common resharpenings on top. Unknown → a generic fallback. */
function toResult(error: unknown): AuthResult {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    const raw = error.message;
    let message = raw;
    if (/already registered/i.test(raw)) message = 'An account already exists with that email. Sign in instead.';
    else if (/password/i.test(raw) && /at least/i.test(raw)) message = 'Use at least 8 characters.';
    else if (/invalid login credentials/i.test(raw)) message = 'That email and password do not match an account.';
    else if (/too many requests/i.test(raw)) message = 'Too many attempts. Wait a few minutes, or reset your password.';
    return { ok: false, code: 'code' in error && typeof error.code === 'string' ? error.code : undefined, message };
  }
  return { ok: false, message: 'Something went wrong. Try again.' };
}

function supabase() {
  const c = getBrowserSupabase();
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) throw new Error('Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL.');
  return c;
}

const REDIRECT_TO = typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : '';

/* ---- EMAIL + PASSWORD ----------------------------------------------------- */

export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  try {
    const { data, error } = await supabase().auth.signInWithPassword({ email, password });
    if (error) return toResult(error);
    return { ok: true, user: { id: data.user.id, email: data.user.email ?? null } };
  } catch (error) {
    return { ok: false, message: 'Could not sign you in.' };
  }
}

export async function registerWithEmail(
  email: string,
  password: string,
  username: string,
  referralCode?: string,
): Promise<AuthResult> {
  try {
    const s = supabase();
    const { data, error } = await s.auth.signUp({
      email,
      password,
      options: {
        data: { username, referralCode },
        emailRedirectTo: REDIRECT_TO,
      },
    });
    if (error) return toResult(error);
    if (!data.user) return { ok: false, message: 'No user was created. Try again.' };
    return {
      ok: true,
      user: { id: data.user.id, email: data.user.email ?? null },
      message: data.session ? undefined : 'Created. Check your inbox to confirm your email before withdrawing.',
    };
  } catch (error) {
    return { ok: false, message: 'Could not create that account.' };
  }
}

export async function resetPassword(email: string): Promise<AuthResult> {
  try {
    const { error } = await supabase().auth.resetPasswordForEmail(email, { redirectTo: REDIRECT_TO });
    if (error) return toResult(error);
    return { ok: true };
  } catch (error) {
    return toResult(error);
  }
}

/* ---- GOOGLE OAUTH ---------------------------------------------------------- */

export async function signInWithGoogle(): Promise<AuthResult> {
  try {
    const { error } = await supabase().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: REDIRECT_TO },
    });
    if (error) return toResult(error);
    // OAuth redirects to /auth/callback; return ok so the caller navigates too.
    return { ok: true };
  } catch (error) {
    return { ok: false, message: 'Could not start Google sign-in.' };
  }
}

/* ---- SESSION --------------------------------------------------------------- */

/** Kept for surface-compat with the Firebase module. Supabase manages the
    session cookie internally, so this is a no-op. */
export async function establishSession(): Promise<void> {}

export async function signOutEverywhere(): Promise<void> {
  try {
    await supabase().auth.signOut();
  } catch {
    // Best-effort; the cookie clears on next request either way.
  }
}

/* ---- STATE SUBSCRIPTION ---------------------------------------------------- */

export function watchAuth(cb: (user: { id: string; email: string | null } | null) => void): () => void {
  const s = supabase();
  const { data } = s.auth.onAuthStateChange((_event, session) => {
    cb(session?.user ? { id: session.user.id, email: session.user.email ?? null } : null);
  });
  return () => data.subscription.unsubscribe();
}