/* ============================================================================
   SUPABASE CLIENT CONFIG GUARD
   ----------------------------------------------------------------------------
   Whether the Supabase client path is available (URL + publishable key set).
   Mirrors `isFirebaseConfigured` so forms/UI can render a clear "not configured"
   state instead of crashing at import, and so both auth paths can coexist while
   the migration is in flight.
   ========================================================================== */

/** True when enough Supabase config is present to initialise the client. */
export const isSupabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);