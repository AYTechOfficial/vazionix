'use client';

import { isSupabaseBackend } from '@/lib/backend';

/* ============================================================================
   AUTH API ROUTER (client)
   ----------------------------------------------------------------------------
   The single import site for sign-in / register / reset / oauth / session /
   watchAuth. Routes to the active backend's auth module (Supabase now, Firebase
   while the migration was in flight) so UI components never import a provider
   directly. Both modules export the same `AuthResult`-shaped surface, so a
   switch is a one-value change in `src/lib/backend.ts`.
   ========================================================================== */

export async function getAuthApi() {
  if (isSupabaseBackend) {
    return import('@/lib/supabase/auth');
  }
  return import('@/lib/firebase/auth');
}