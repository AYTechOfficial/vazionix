import { NextResponse } from 'next/server';
import { verifyEmail, getCurrentNativeUser, setSessionCookie, createSession } from '@/server/auth-native';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (!token || !(await verifyEmail(token))) return NextResponse.redirect(new URL('/login?error=verification', url.origin));
  const user = await getCurrentNativeUser();
  if (user) await setSessionCookie(await createSession(user.id));
  return NextResponse.redirect(new URL('/dashboard?verified=1', url.origin));
}
