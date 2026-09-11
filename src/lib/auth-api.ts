'use client';

/* ============================================================================
   AUTH API (client)
   ----------------------------------------------------------------------------
   The single import site for sign-in / register / reset / oauth / session /
   watchAuth. Supabase is the auth backend: the browser client writes its own
   httpOnly, encrypted auth cookies on sign-in, and the server reads them back
   through getSsrSupabase() with a signature check (auth.getUser()).
   ========================================================================== */

export async function getAuthApi() {
  return import('@/lib/supabase/auth');
}
