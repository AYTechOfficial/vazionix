/* ============================================================================
   BACKEND SELECTOR
   ----------------------------------------------------------------------------
   Which data/auth backend the app runs on: `supabase` or `firebase`.

   During the migration both paths remain in the tree and deployable. This
   constant is the single switch that decides which one the forms, session and
   server data layer use. Set DATA_BACKEND in env if you ever need to pin it;
   the default is `supabase` now that the migration has landed.

   The non-selected path is not deleted — it stays importable so reverting is
   a one-value change, not a git archaeology exercise.
   ========================================================================== */

export type DataBackend = 'supabase' | 'firebase';

export const DATA_BACKEND: DataBackend = process.env.DATA_BACKEND === 'firebase' ? 'firebase' : 'supabase';

export const isSupabaseBackend = DATA_BACKEND === 'supabase';
export const isFirebaseBackend = DATA_BACKEND === 'firebase';