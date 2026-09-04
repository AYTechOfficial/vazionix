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

/* ---- LEDGER RPC BRIDGE -------------------------------------------------- */
/* The money path lives in Postgres functions (public.credit / public.debit)
   so the invariant is DB-enforced. These wrappers return the SAME shape the
   app's in-process ledger produced, so callers can switch with minimal churn. */

export interface CreditRpcResult {
  ok: boolean;
  error?: string;
  message?: string;
  credited?: number;
  bonusBps?: number;
  exp?: number;
  balance?: number;
  level?: number;
  levelUp?: boolean;
  claimId?: string;
  replayed?: boolean;
  referrerUid?: string;
  commission?: number;
  refRefId?: string;
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
  claimId?: string;
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
  claimId?: string;
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