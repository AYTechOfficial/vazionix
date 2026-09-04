import 'server-only';

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';

/* ============================================================================
   SUPABASE SSR SERVER CLIENT (session-scoped)
   ----------------------------------------------------------------------------
   Creates a Supabase client bound to the request's cookies. Used wherever the
   request session matters (Server Components/Route Handlers reading the logged-in
   user via getUser()). This is the *signed-in user* path and only carries the
   publishable key + the user's JWT cookies — NOT the service_role key.

   Contrast with src/server/supabase.ts (service_role, bypasses RLS, server
   mutation) and src/lib/supabase/client.ts (browser).
   ========================================================================== */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

export async function getSsrSupabase() {
  const store = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called from a Server Component; ignore and rely on middleware refresh.
        }
      },
    },
  });
}