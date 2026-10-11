import 'server-only';

import type { CouponRow } from '@/lib/models';

import { AppError, conflict } from '../db';
import {
  supabaseCountCouponRedemptions,
  supabaseGetCoupon,
  supabaseGetUser,
  supabaseListClaims,
  supabaseRedeemCoupon,
} from '../data-supabase';
import { credit } from '../ledger';
import { getServerSupabase } from '../supabase';

/* ============================================================================
   COUPONS
   ----------------------------------------------------------------------------
   `coupons` — the primary key IS the code, upper-cased, so a lookup is one
   read and two coupons cannot share a code.

     tokens          integer tokens credited to the earning balance
     ad_credit       USD added to the advertiser deposit balance (users
                     .deposit_balance) when the column is present
     max_redemptions 0 means unlimited
     expires_at      timestamp, or null for no expiry
     enabled
     note            free text shown in the redemption list

   `coupon_redemptions` holds one row per (code, user_id) — the composite
   primary key IS the race guard. "One per user" holds under two simultaneous
   requests because the second INSERT fails with a unique violation rather
   than both reading `count = 0`; the global cap is enforced by counting the
   redemption rows, not a drift-prone counter on the coupon.
   ========================================================================== */

export interface RedeemResult {
  code: string;
  tokens: number;
  adCredit: number;
  balance: number;
  message: string;
}

export async function redeemCoupon(args: {
  uid: string;
  code: string;
  ip: string | null;
}): Promise<RedeemResult> {
  const code = args.code.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) {
    throw new AppError('That does not look like a coupon code.', 400, 'invalid_code');
  }

  const row = await supabaseGetCoupon(code);
  if (!row) throw new AppError('That coupon does not exist.', 404, 'not_found');
  if (row.enabled === false) throw new AppError('That coupon is no longer active.', 400, 'disabled');

  const expiresAt = row.expires_at ? new Date(row.expires_at as string).toISOString() : null;
  if (expiresAt && Date.parse(expiresAt) < Date.now()) {
    throw new AppError('That coupon has expired.', 400, 'expired');
  }

  const max = Number(row.max_redemptions ?? 0);
  if (max > 0) {
    const used = await supabaseCountCouponRedemptions(code);
    if (used >= max) throw conflict('That coupon has been fully claimed.', 'exhausted');
  }

  /* The unique (code, user_id) primary key is the race guard: a second
     redemption by the same user fails the insert rather than double-crediting. */
  const claimed = await supabaseRedeemCoupon(code, args.uid);
  if (!claimed) throw conflict('You have already used that coupon.', 'already_redeemed');

  const prepared = {
    tokens: Number(row.tokens ?? 0),
    adCredit: Number(row.ad_credit ?? 0),
    label: String(row.note ?? 'Coupon'),
  };

  let balance = 0;
  if (prepared.tokens > 0) {
    const result = await credit({
      uid: args.uid,
      source: 'coupon',
      amount: prepared.tokens,
      label: `Coupon ${code}`,
      refId: code,
      idempotencyKey: `coupon_${code}`,
      applyBonus: false,
      score: false,
      ip: args.ip,
    });
    balance = result.balance;
  }

  if (prepared.adCredit > 0) {
    /* Read-then-write increment: PostgREST cannot express
       deposit_balance = deposit_balance + n directly. */
    const user = await supabaseGetUser(args.uid);
    const current = Number((user as Record<string, unknown> | null)?.deposit_balance ?? 0);
    const { error } = await getServerSupabase()
      .from('users')
      .update({ deposit_balance: current + prepared.adCredit, updated_at: new Date().toISOString() })
      .eq('id', args.uid);
    if (error) throw error;
  }

  return {
    code,
    tokens: prepared.tokens,
    adCredit: prepared.adCredit,
    balance,
    message:
      prepared.tokens && prepared.adCredit
        ? `${prepared.tokens.toLocaleString('en-US')} tokens and $${prepared.adCredit.toFixed(2)} ad credit added.`
        : prepared.tokens
          ? `${prepared.tokens.toLocaleString('en-US')} tokens added to your balance.`
          : `$${prepared.adCredit.toFixed(2)} ad credit added.`,
  };
}

/** A user's own redemption history, for the coupon page table. */
export async function listRedemptions(uid: string, limit = 25): Promise<CouponRow[]> {
  const rows = await supabaseListClaims(uid, { limit, source: 'coupon', cursorIso: null });
  return rows.slice(0, limit).map((d: Record<string, unknown>) => ({
    id: String(d.id ?? ''),
    code: d.ref_id ? String(d.ref_id) : '—',
    balance: Number(d.amount ?? 0),
    adBalance: 0,
    discount: d.label ? String(d.label) : 'Coupon',
    at: d.created_at ? new Date(d.created_at as string).toISOString() : new Date().toISOString(),
  }));
}
