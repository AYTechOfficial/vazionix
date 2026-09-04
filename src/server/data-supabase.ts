import 'server-only';

import { isServerSupabaseReady, getServerSupabase } from './supabase';

/* ============================================================================
   SUPABASE DATA ACCESS — read helpers for the server layer
   ----------------------------------------------------------------------------
   On the Supabase backend, the app's `uid` is the Supabase auth user's UUID
   (`auth_id` in public.users, and the `users.id` primary key is that same UUID
   because the auth-profile-bootstrap trigger inserts it that way). So:

     uid  == public.users.auth_id  == public.users.id (for auth-created users)

   These helpers cover the READ paths the faucet / profile / leaderboard need, so
   the money mutation (rpc) and its surrounding reads all run against Postgres.
   ========================================================================== */

const bc = () => {
  if (!isServerSupabaseReady()) throw new Error('[supabase] not configured on server');
  return getServerSupabase();
};

/** Resolve a user row by app uid. */
export async function supabaseGetUser(uid: string) {
  const supabase = bc();
  const { data, error } = await supabase.from('users').select('*').eq('id', uid).maybeSingle();
  if (error) throw error;
  return data;
}

/** Read the economy/rates/site value as JSON from the config table. */
export async function supabaseGetConfig(key: string): Promise<Record<string, unknown> | null> {
  const supabase = bc();
  const { data, error } = await supabase.from('config').select('value').eq('key', key).maybeSingle();
  if (error) throw error;
  return data && data.value ? (data.value as Record<string, unknown>) : null;
}

/** Read all ad-unit inventory (placement_id -> row). */
export async function supabaseGetAdUnits(): Promise<Array<Record<string, unknown>>> {
  const supabase = bc();
  const { data, error } = await supabase.from('ad_units').select('*');
  if (error) throw error;
  return data ?? [];
}

/** Count of a user's signed claims for a source on a given UTC day (daily cap). */
export async function supabaseCountClaims(uid: string, source: string, day: string): Promise<number> {
  const supabase = bc();
  const { count, error } = await supabase
    .from('claims')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', uid)
    .eq('source', source)
    .eq('day', day);
  if (error) throw error;
  return count ?? 0;
}

/** Read a cooldown row (faucet window). */
export async function supabaseGetCooldown(uid: string, kind: string): Promise<{ nextAt: string | null; claims: number }> {
  const supabase = bc();
  const { data, error } = await supabase
    .from('user_cooldowns')
    .select('next_at, claims')
    .eq('user_id', uid)
    .eq('kind', kind)
    .maybeSingle();
  if (error) throw error;
  return {
    nextAt: data?.next_at ? new Date(data.next_at).toISOString() : null,
    claims: data?.claims ?? 0,
  };
}

/** Write/merge a cooldown row. */
export async function supabaseSetCooldown(
  uid: string,
  kind: string,
  patch: { nextAt?: Date | null; claims?: number; lastClaimAt?: Date | null },
): Promise<void> {
  const supabase = bc();
  const { error } = await supabase.from('user_cooldowns').upsert(
    {
      user_id: uid,
      kind,
      next_at: patch.nextAt ? patch.nextAt.toISOString() : null,
      last_claim_at: patch.lastClaimAt ? patch.lastClaimAt.toISOString() : null,
      claims: patch.claims,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,kind' },
  );
  if (error) throw error;
}

/** Notifications for a user, newest first. */
export async function supabaseListNotifications(uid: string, limit = 20) {
  const supabase = bc();
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', uid)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}