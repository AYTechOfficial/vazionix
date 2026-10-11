import { NextResponse } from 'next/server';

import { verifyEmail } from '@/server/auth-native';

/* ============================================================================
   GET /auth/callback
   ----------------------------------------------------------------------------
   Supabase redirects here after OAuth (Google) completes or a confirmation /
   password-reset link is followed. The exchange code lives in the ?code=
   query param; calling auth.exchangeCodeForSession() swaps it for a session,
   which @supabase/ssr stores into the httpOnly auth cookies automatically.
   The user is then routed into the app (dashboard by default).

   Also handles the password-recovery flow: when the code carries a login
   session, the user is sent to /login (the reset flow's recovery hook the forms
   expect). A malformed/no code is a 400, not a crash.
   ========================================================================== */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const token = searchParams.get('token');
  const next = searchParams.get('next') ?? '/dashboard';

  if (token && await verifyEmail(token)) return NextResponse.redirect(`${origin}${next}`);
  if (code && await verifyEmail(code)) return NextResponse.redirect(`${origin}${next}`);
  return NextResponse.redirect(`${origin}/login?error=callback`);
}