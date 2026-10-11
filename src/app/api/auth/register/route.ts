import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { createNativeAccount, setSessionCookie, sendVerificationEmail } from '@/server/auth-native';
import { ensureUser } from '@/server/users';
import { clientCountry, clientIp } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const referralCode = typeof body.referralCode === 'string' ? body.referralCode.trim() || null : null;
    if (!email || !email.includes('@') || email.length > 254) return NextResponse.json({ ok: false, code: 'invalid_email', message: 'Enter a valid email address.' }, { status: 400 });
    if (password.length < 10) return NextResponse.json({ ok: false, code: 'weak_password', message: 'Use at least 10 characters.' }, { status: 400 });
    if (!/^[a-zA-Z0-9_.]{3,20}$/.test(username)) return NextResponse.json({ ok: false, code: 'invalid_username', message: 'Usernames are 3–20 characters: letters, numbers, underscore or dot.' }, { status: 400 });

    const created = await createNativeAccount({ email, password, username, referralCode });
    const nextRequest = request as NextRequest;
    await ensureUser({ uid: created.user.id, email, username, referralCode, countryCode: clientCountry(nextRequest), ip: clientIp(nextRequest) });
    const session = await import('@/server/auth-native').then((m) => m.createSession(created.user.id));
    await setSessionCookie(session);
    await sendVerificationEmail(email, created.verificationToken);
    return NextResponse.json({ ok: true, user: { id: created.user.id, email }, emailVerified: false, message: 'Account created. Check your inbox to verify your email.' }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === '23505') return NextResponse.json({ ok: false, code: 'already_registered', message: 'An account already exists with that email or username.' }, { status: 409 });
    console.error('[auth/register]', error);
    return NextResponse.json({ ok: false, code: 'internal', message: 'Could not create that account.' }, { status: 500 });
  }
}
