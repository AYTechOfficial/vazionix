import { NextResponse } from 'next/server';

import { authenticateNativeAccount, createSession, setSessionCookie } from '@/server/auth-native';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const user = await authenticateNativeAccount(email, password);
    if (!user) return NextResponse.json({ ok: false, code: 'invalid_credentials', message: 'That email and password do not match an account.' }, { status: 401 });
    const session = await createSession(user.id);
    await setSessionCookie(session);
    return NextResponse.json({ ok: true, user: { id: user.id, email: user.email }, emailVerified: Boolean(user.emailVerifiedAt) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[auth/login]', error);
    return NextResponse.json({ ok: false, code: 'internal', message: 'Could not sign you in.' }, { status: 500 });
  }
}
