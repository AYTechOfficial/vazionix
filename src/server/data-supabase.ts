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

/** Create a notification row (fire-and-forget from the caller). */
export async function supabaseInsertNotification(uid: string, n: Record<string, unknown>): Promise<void> {
  const supabase = bc();
  await supabase.from('notifications').insert({ user_id: uid, ...n });
}

/** Read a stats row (edge key 'global' or 'YYYY-MM-DD'). */
export async function supabaseGetStats(day: string): Promise<Record<string, unknown> | null> {
  const supabase = bc();
  const { data, error } = await supabase.from('stats').select('*').eq('day', day).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/** Count of users active in the last N minutes (online-now). */
export async function supabaseCountOnline(minutes: number): Promise<number> {
  const supabase = bc();
  const since = new Date(Date.now() - minutes * 60000).toISOString();
  const { count, error } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .gte('last_seen_at', since);
  if (error) throw error;
  return count ?? 0;
}

/** Completed withdrawals for the payout ticker, newest first. */
export async function supabaseGetCompletedWithdrawals(limit = 12) {
  const supabase = bc();
  const { data, error } = await supabase
    .from('withdrawals')
    .select('*')
    .eq('status', 'Completed')
    .order('processed_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

/** Daily stats in ascending day order (newest N days). */
export async function supabaseGetDailyStats(days: number): Promise<Array<Record<string, unknown>>> {
  const supabase = bc();
  const { data, error } = await supabase.from('stats').select('*').order('day', { ascending: true }).limit(days);
  if (error) throw error;
  return data ?? [];
}

/** Leaderboard entries for a board, highest value first. */
export async function supabaseGetBoardEntries(board: string, limit: number) {
  const supabase = bc();
  const { data, error } = await supabase
    .from('leaderboard_entries')
    .select('*')
    .eq('board', board)
    .eq('period', 'current')
    .order('value', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

/** A single viewer's entry on a board (the "you" strip). */
export async function supabaseGetViewerBoardEntry(uid: string, board: string) {
  const supabase = bc();
  const { data, error } = await supabase
    .from('leaderboard_entries')
    .select('*')
    .eq('board', board)
    .eq('period', 'current')
    .eq('user_id', uid)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/** A user's withdrawals, newest first. */
export async function supabaseListWithdrawals(uid: string, limit = 25) {
  const supabase = bc();
  const { data, error } = await supabase
    .from('withdrawals')
    .select('*')
    .eq('user_id', uid)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

/** A user's saved addresses, newest first. */
export async function supabaseListAddresses(uid: string) {
  const supabase = bc();
  const { data, error } = await supabase.from('saved_addresses').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(20);
  if (error) throw error;
  return data ?? [];
}

/** A user's withdrawal with a given client_request_id (submit replay lookup). */
export async function supabaseGetWithdrawalByRequestId(uid: string, clientRequestId: string) {
  const supabase = bc();
  const { data, error } = await supabase
    .from('withdrawals')
    .select('*')
    .eq('user_id', uid)
    .eq('client_request_id', clientRequestId)
    .limit(1);
  if (error) throw error;
  return (data ?? [])[0] ?? null;
}

/** Count of a user's withdrawals created today (daily withdraw cap). */
export async function supabaseCountWithdrawalsToday(uid: string, dayStartIso: string, dayEndIso: string): Promise<number> {
  const supabase = bc();
  const { count, error } = await supabase
    .from('withdrawals')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', uid)
    .gte('created_at', dayStartIso)
    .lt('created_at', dayEndIso);
  if (error) throw error;
  return count ?? 0;
}

/** Insert a withdrawal row. */
export async function supabaseInsertWithdrawal(row: Record<string, unknown>): Promise<void> {
  const supabase = bc();
  const { error } = await supabase.from('withdrawals').insert(row);
  if (error) throw error;
}

/** Read a challenge by id. */
export async function supabaseGetChallenge(id: string) {
  const supabase = bc();
  const { data, error } = await supabase.from('challenges').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/** Enabled challenges, highest reward first. */
export async function supabaseListChallenges() {
  const supabase = bc();
  const { data, error } = await supabase.from('challenges').select('*').eq('enabled', true).order('tokens', { ascending: false }).limit(100);
  if (error) throw error;
  return data ?? [];
}

/** Update a user's streak fields (daily bonus claim). */
export async function supabaseUpdateUserStreak(uid: string, streakDays: number, lastStreakClaimAtIso: string): Promise<void> {
  const supabase = bc();
  const { error } = await supabase
    .from('users')
    .update({ streak_days: streakDays, last_streak_claim_at: lastStreakClaimAtIso, updated_at: new Date().toISOString() })
    .eq('id', uid);
  if (error) throw error;
}

/** Mark a user's unread notifications as read. */
export async function supabaseMarkNotificationsRead(uid: string): Promise<void> {
  const supabase = bc();
  await supabase.from('notifications').update({ read: true, updated_at: new Date().toISOString() }).eq('user_id', uid).eq('read', false);
}

/** Ledger rows for a user, newest first, optional source filter + cursor. */
export async function supabaseListClaims(
  uid: string,
  opts: { limit?: number; source?: string | null; cursorIso?: string | null },
) {
  const supabase = bc();
  let q = supabase
    .from('claims')
    .select('*')
    .eq('user_id', uid)
    .order('created_at', { ascending: false })
    .limit((opts.limit ?? 25) + 1);
  if (opts.source) q = q.eq('source', opts.source);
  if (opts.cursorIso) q = q.lt('created_at', opts.cursorIso);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

/** Per-source totals over the last N days, for the dashboard earnings chart. */
export async function supabaseEarningsByDay(uid: string, days: number) {
  const supabase = bc();
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data, error } = await supabase
    .from('claims')
    .select('amount, source, created_at, day')
    .eq('user_id', uid)
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(3000);
  if (error) throw error;
  return data ?? [];
}