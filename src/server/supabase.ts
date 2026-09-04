import 'server-only';

import { createClient } from '@supabase/supabase-js';

/* ============================================================================
   SUPABASE SERVER CLIENT
   ----------------------------------------------------------------------------
   Server-side Supabase access. Uses the service_role key, which FULLY BYPASSES
   RLS — exactly like the Firebase Admin SDK bypasses firestore.rules today.

   SECURITY: this key must NEVER carry a NEXT_PUBLIC_ prefix (it would ship to
   the browser bundle). It lives only in src/server and Edge Functions.
   ========================================================================== */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

/** True when Supabase credentials are present (mirrors isServerFirebaseReady). */
export function isServerSupabaseReady(): boolean {
  return Boolean(url && serviceRoleKey && serviceRoleKey !== 'service_role <paste-your-service-role-jwt-here>');
}

/** The service-role client. Throws a loud, named error if misconfigured so a
    silent auth failure can't look like a working-but-empty backend. */
export function getServerSupabase() {
  if (!isServerSupabaseReady()) {
    throw new Error(
      '[supabase] NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (server-only)',
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}