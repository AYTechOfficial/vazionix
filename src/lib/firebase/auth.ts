import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';

import { getFirebaseAuth } from './client';

/* ============================================================================
   AUTHENTICATION
   ----------------------------------------------------------------------------
   Two halves, deliberately separated:

   CLIENT  — Firebase Auth does the credential exchange and gives us a
             short-lived ID token.
   SERVER  — that ID token is POSTed once to /api/auth/session, which uses the
             Admin SDK to mint an httpOnly, Secure, SameSite=Lax SESSION COOKIE.

   Why the cookie rather than the ID token:
   • The ID token lives in IndexedDB and is readable by any script on the
     origin. One XSS and an attacker has a bearer token for an hour. An
     httpOnly cookie is not readable from JS at all.
   • Server Components and middleware can read a cookie. They cannot read
     IndexedDB, so without this every authenticated page would have to be a
     Client Component that waits for `onAuthStateChanged` — which is exactly
     the "logged-out flash on every navigation" that plagues Firebase apps.
   • Session cookies can be revoked server-side
     (`revokeRefreshTokens` + `checkRevoked`). ID tokens cannot be, until they
     expire.

   Nothing here decides authorisation. Rules do. This layer only establishes
   *who* the caller is.
   ========================================================================== */

export interface AuthResult {
  ok: boolean;
  /** Firebase error code, e.g. 'auth/wrong-password'. */
  code?: string;
  message?: string;
  user?: User;
}

/** Human copy per Firebase error code. Generic failures are never surfaced as
    a raw code — "auth/invalid-credential" tells a user nothing. */
const ERROR_COPY: Record<string, string> = {
  'auth/invalid-email': 'That email address is not valid.',
  'auth/user-disabled': 'This account is suspended. Open a ticket and support will review it.',
  'auth/user-not-found': 'No account matches that email.',
  'auth/wrong-password': 'That password is not right.',
  'auth/invalid-credential': 'That email and password do not match an account.',
  'auth/email-already-in-use': 'An account already exists with that email. Sign in instead.',
  'auth/weak-password': 'Use at least 10 characters. A passphrase beats a short complex string.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes, or reset your password.',
  'auth/popup-closed-by-user': 'The Google window closed before sign-in finished.',
  'auth/network-request-failed': 'Network problem. Check your connection and try again.',
};

function toResult(error: unknown): AuthResult {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : 'auth/unknown';
  return { ok: false, code, message: ERROR_COPY[code] ?? 'Something went wrong. Try again.' };
}

function requireAuth() {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error('Firebase is not configured. Copy .env.example to .env.local.');
  return auth;
}

/* ---- EMAIL + PASSWORD ----------------------------------------------------- */

export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  try {
    const cred = await signInWithEmailAndPassword(requireAuth(), email, password);
    await establishSession(cred.user);
    return { ok: true, user: cred.user };
  } catch (error) {
    return toResult(error);
  }
}

export async function registerWithEmail(
  email: string,
  password: string,
  username: string,
  referralCode?: string,
): Promise<AuthResult> {
  try {
    const cred = await createUserWithEmailAndPassword(requireAuth(), email, password);
    await updateProfile(cred.user, { displayName: username });

    /* The /users/{uid} document is NOT created here. A Cloud Function on
       `auth.user().onCreate` writes it, because `balance`, `level`, `exp` and
       `referredBy` are all server-write-only (firestore.rules) — a client
       creating its own user document could seed itself a balance. The referral
       code travels as a custom claim request instead. */
    await establishSession(cred.user, { username, referralCode });
    await sendEmailVerification(cred.user);
    return { ok: true, user: cred.user };
  } catch (error) {
    return toResult(error);
  }
}

export async function resetPassword(email: string): Promise<AuthResult> {
  try {
    await sendPasswordResetEmail(requireAuth(), email);
    return { ok: true };
  } catch (error) {
    return toResult(error);
  }
}

/* ---- GOOGLE OAUTH ---------------------------------------------------------- */

export async function signInWithGoogle(): Promise<AuthResult> {
  try {
    const provider = new GoogleAuthProvider();
    // Always show the chooser: silent re-auth into the wrong Google account is
    // the most common support ticket for multi-account households.
    provider.setCustomParameters({ prompt: 'select_account' });
    const cred = await signInWithPopup(requireAuth(), provider);
    await establishSession(cred.user);
    return { ok: true, user: cred.user };
  } catch (error) {
    return toResult(error);
  }
}

/* ---- SESSION --------------------------------------------------------------- */

/**
 * Exchange the client ID token for an httpOnly session cookie.
 *
 * The server half is `src/app/api/auth/session/route.ts` → `src/server/session.ts`,
 * which verifies the token, checks `auth_time` is recent, mints the cookie with the
 * Admin SDK and creates the `/users/{uid}` profile on a first sign-in.
 *
 * The `auth_time` check is the part that matters: it means a stolen refresh token
 * cannot be upgraded into a fourteen-day session cookie.
 */
export async function establishSession(
  user: User,
  profile?: { username?: string; referralCode?: string },
): Promise<void> {
  const idToken = await user.getIdToken();
  await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken, ...profile }),
  });
}

export async function signOutEverywhere(): Promise<void> {
  await fetch('/api/auth/session', { method: 'DELETE' });
  const auth = getFirebaseAuth();
  if (auth) await signOut(auth);
}

/* THERE IS NO SERVER-SIDE SESSION READ IN THIS FILE, ON PURPOSE.
   ----------------------------------------------------------------------------
   An earlier revision exported a `getSessionUser()` here that dynamically
   imported `./admin`. The dynamic import was meant to keep `firebase-admin` out
   of the browser bundle, and it does not: webpack still follows the edge and
   pulls the module into any client graph that imports this file. Since
   `AccountSettings`, `LoginForm` and `RegisterForm` all import the sign-in
   helpers above, that dragged the Admin SDK — and its `import 'server-only'`
   guard — into the client, and the build failed on exactly the right error.

   Session reading lives in `src/server/session.ts` (`getSessionClaims`,
   `getViewer`, `requireUser`, `requireAdmin`), which is `server-only` all the way
   down and never reachable from a Client Component. Keep this file free of any
   `firebase-admin` reference, dynamic or otherwise. */

/** Subscribe to auth state. Used by surfaces that need to know whether a
    credential still exists on the client, independent of the session cookie. */
export function watchAuth(cb: (user: User | null) => void): () => void {
  const auth = getFirebaseAuth();
  if (!auth) {
    cb(null);
    return () => {};
  }
  return onAuthStateChanged(auth, cb);
}
