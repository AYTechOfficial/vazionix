import 'server-only';

import { cache } from 'react';
import type { Viewer } from '@/lib/models';
import { forbidden, unauthorized } from './db';
import { getCurrentNativeUser, clearSession, SESSION_COOKIE } from './auth-native';
import { cookies } from 'next/headers';

export interface SessionClaims {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  admin: boolean;
  adminRole: string | null;
  support: boolean;
  advertiser: boolean;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value ?? null;
  await clearSession(raw);
  store.delete(SESSION_COOKIE);
}

export const getSessionClaims = cache(async (): Promise<SessionClaims | null> => {
  try {
    const user = await getCurrentNativeUser();
    if (!user) return null;
    return {
      uid: user.id,
      email: user.email,
      emailVerified: Boolean(user.emailVerifiedAt),
      name: user.username,
      admin: false,
      adminRole: null,
      support: false,
      advertiser: false,
    };
  } catch {
    return null;
  }
});

export const getViewer = cache(async (): Promise<Viewer | null> => {
  const claims = await getSessionClaims();
  if (!claims) return null;
  const username = claims.name ?? claims.email?.split('@')[0] ?? 'member';
  return { uid: claims.uid, email: claims.email, emailVerified: claims.emailVerified, username, initials: initialsFor(username), admin: claims.admin, adminRole: claims.adminRole };
});

export function initialsFor(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9 ]/g, ' ').trim();
  if (!cleaned) return 'VZ';
  const parts = cleaned.split(/\s+/);
  if (parts.length > 1) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  return cleaned.slice(0, 2).toUpperCase();
}

export async function requireUser(): Promise<SessionClaims> {
  const claims = await getSessionClaims();
  if (!claims) throw unauthorized();
  return claims;
}

export async function requireVerifiedUser(): Promise<SessionClaims> {
  const claims = await requireUser();
  if (!claims.emailVerified) throw forbidden('Verify your email address first — check your inbox for the link.');
  return claims;
}

export async function requireAdmin(): Promise<SessionClaims> {
  const claims = await requireUser();
  if (!claims.admin) throw forbidden('Staff access only.');
  return claims;
}
