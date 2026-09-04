import { createBrowserClient } from '@supabase/ssr';

import { isSupabaseConfigured } from './config';

/* ============================================================================
   SUPABASE BROWSER CLIENT
   ----------------------------------------------------------------------------
   Client-side Supabase access via the publishable key (safe to expose). Used
   only for the signed-in user's own profile read and auth session — the same
   one-grant model as the Firebase SessionProvider. The service_role key never
   imports here.
   ========================================================================== */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

export function getBrowserSupabase() {
  if (!isSupabaseConfigured) {
    throw new Error('[supabase-client] not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  }
  return createBrowserClient(url, anonKey);
}