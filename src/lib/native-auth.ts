'use client';

export interface AuthResult {
  ok: boolean;
  code?: string;
  message?: string;
  user?: { id: string; email: string | null };
}

async function call(path: string, body: Record<string, unknown>): Promise<AuthResult> {
  try {
    const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
    const payload = await response.json() as AuthResult;
    return response.ok ? payload : { ok: false, code: payload.code, message: payload.message ?? 'Authentication failed.' };
  } catch {
    return { ok: false, code: 'network', message: 'Could not reach the authentication service.' };
  }
}

export function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  return call('/api/auth/login', { email, password });
}

export function registerWithEmail(email: string, password: string, username: string, referralCode?: string): Promise<AuthResult> {
  return call('/api/auth/register', { email, password, username, referralCode });
}

export function resetPassword(_email: string): Promise<AuthResult> {
  return Promise.resolve({ ok: false, code: 'not_configured', message: 'Password reset email is not configured yet.' });
}

export function signInWithGoogle(): Promise<AuthResult> {
  return Promise.resolve({ ok: false, code: 'not_configured', message: 'Google sign-in is not configured for native BootKeep auth.' });
}

export async function establishSession(): Promise<void> {}

export async function signOutEverywhere(): Promise<void> {
  await fetch('/api/auth/session', { method: 'DELETE', credentials: 'include' });
}

export function watchAuth(cb: (user: { id: string; email: string | null } | null) => void): () => void {
  let active = true;
  void fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' })
    .then((response) => response.json())
    .then((body: { user?: { id: string; email: string | null } | null }) => { if (active) cb(body.user ?? null); })
    .catch(() => { if (active) cb(null); });
  return () => { active = false; };
}
