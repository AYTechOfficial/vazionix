import 'server-only';

import { createClient } from '@supabase/supabase-js';

/* ============================================================================
   SUPABASE SERVER CLIENT
   ----------------------------------------------------------------------------
   Server-side Supabase access. Uses the service_role key, which FULLY BYPASSES
   RLS — every row policy below assumes that and guards the code paths instead.

   SECURITY: this key must NEVER carry a NEXT_PUBLIC_ prefix (it would ship to
   the browser bundle). It lives only in src/server and Edge Functions.
   ========================================================================== */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

/** True when Supabase credentials are present. */
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

/* ---- LEDGER RPC BRIDGE -------------------------------------------------- */
/* The money path lives in Postgres functions (public.credit / public.debit)
   so the invariant is DB-enforced. These wrappers return the SAME shape the
   app's in-process ledger produced, so callers can switch with minimal churn.
   The SQL functions return BOTH snake_case and camelCase keys (migration
   0019); the interfaces carry both and the app reads camelCase. */

export interface CreditRpcResult {
  ok: boolean;
  error?: string;
  message?: string;
  credited?: number;
  bonusBps?: number;
  bonus_bps?: number;
  exp?: number;
  balance?: number;
  level?: number;
  levelUp?: boolean;
  level_up?: boolean;
  claimId?: number | string;
  claim_id?: number | string;
  replayed?: boolean;
  referrerUid?: string | null;
  referrer_uid?: string | null;
  commission?: number;
  refRefId?: string | null;
  ref_ref_id?: string | null;
}

export async function rpcCredit(input: {
  userUuid: string;
  source: string;
  amount: number;
  exp?: number;
  refId?: string | null;
  label?: string;
  idempotencyKey?: string | null;
  applyBonus?: boolean;
  score?: boolean;
  ip?: string | null;
  meta?: Record<string, unknown> | null;
}): Promise<CreditRpcResult> {
  const supabase = getServerSupabase();
  const { data, error } = await supabase.rpc('credit', {
    p_uid: input.userUuid,
    p_source: input.source,
    p_amount: input.amount,
    p_exp: input.exp ?? 0,
    p_ref_id: input.refId ?? null,
    p_label: input.label ?? '',
    p_idempotency_key: input.idempotencyKey ?? null,
    p_apply_bonus: input.applyBonus ?? true,
    p_score: input.score ?? true,
    p_ip: input.ip ?? null,
    p_meta: (input.meta as never) ?? null,
  });
  if (error) {
    return { ok: false, error: error.message, message: error.message, credited: 0 };
  }
  const body = data as CreditRpcResult;
  return body;
}

export interface DebitRpcResult {
  ok: boolean;
  error?: string;
  message?: string;
  debited?: number;
  balance?: number;
  claimId?: number | string;
  claim_id?: number | string;
  replayed?: boolean;
}

export async function rpcDebit(input: {
  userUuid: string;
  amount: number;
  source?: string;
  refId?: string | null;
  label?: string;
  idempotencyKey?: string | null;
  lock?: boolean;
}): Promise<DebitRpcResult> {
  const supabase = getServerSupabase();
  const { data, error } = await supabase.rpc('debit', {
    p_uid: input.userUuid,
    p_amount: input.amount,
    p_source: input.source ?? 'withdrawal',
    p_ref_id: input.refId ?? null,
    p_label: input.label ?? '',
    p_idempotency_key: input.idempotencyKey ?? null,
    p_lock: input.lock ?? false,
  });
  if (error) {
    return { ok: false, error: error.message, message: error.message, debited: 0 };
  }
  return data as DebitRpcResult;
}

export interface RefundRpcResult {
  ok: boolean;
  error?: string;
  message?: string;
  balance?: number;
  claimId?: number | string;
  claim_id?: number | string;
}

export async function rpcRefund(input: {
  userUuid: string;
  tokens: number;
  refId: string;
  reason?: string;
}): Promise<RefundRpcResult> {
  const supabase = getServerSupabase();
  const { data, error } = await supabase.rpc('refund', {
    p_uid: input.userUuid,
    p_tokens: input.tokens,
    p_ref_id: input.refId,
    p_reason: input.reason ?? '',
  });
  if (error) {
    return { ok: false, error: error.message, message: error.message };
  }
  return data as RefundRpcResult;
}

/* ---- STATS RPC ----------------------------------------------------------- */
/* public.bump_stats() (0019) upserts the 'global' lifetime row and today's row
   in one call, DB-enforced so two concurrent claims cannot lose an increment
   the way a read-modify-write in JS would. */

export async function rpcBumpStats(patch: {
  members?: number;
  membersToday?: number;
  claims?: number;
  tokensCredited?: number;
  withdrawals?: number;
  tokensWithdrawn?: number;
  usdWithdrawn?: number;
  ptcViews?: number;
  shortlinkClaims?: number;
  offerwallConversions?: number;
  adImpressions?: number;
}): Promise<void> {
  const supabase = getServerSupabase();
  const { error } = await supabase.rpc('bump_stats', {
    p_members: patch.members ?? 0,
    p_members_today: patch.membersToday ?? 0,
    p_claims: patch.claims ?? 0,
    p_tokens_credited: patch.tokensCredited ?? 0,
    p_withdrawals: patch.withdrawals ?? 0,
    p_tokens_withdrawn: patch.tokensWithdrawn ?? 0,
    p_usd_withdrawn: patch.usdWithdrawn ?? 0,
    p_ptc_views: patch.ptcViews ?? 0,
    p_shortlink_claims: patch.shortlinkClaims ?? 0,
    p_offerwall_conversions: patch.offerwallConversions ?? 0,
    p_ad_impressions: patch.adImpressions ?? 0,
  });
  if (error) throw new Error(`[stats] bump_stats failed: ${error.message}`);
}

/* ---- WITHDRAWAL STATUS RPC ------------------------------------------------ */
/* public.set_withdrawal_status() (0019) performs the console's status transition
   under a row lock, including the locked-balance release on Completion, so two
   operators clicking at once cannot both act. */

export async function rpcSetWithdrawalStatus(input: {
  id: string;
  status: string;
  actor: string;
  txid?: string | null;
  failure?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = getServerSupabase();
  const { data, error } = await supabase.rpc('set_withdrawal_status', {
    p_id: input.id,
    p_status: input.status,
    p_actor: input.actor,
    p_txid: input.txid ?? null,
    p_failure: input.failure ?? null,
  });
  if (error) {
    return { ok: false, error: error.message };
  }
  return (data ?? { ok: false, error: 'no_result' }) as { ok: boolean; error?: string };
}