import 'server-only';

import type { CouponRow } from '@/lib/models';

import { AppError, FieldValue, bool, conflict, db, int, iso, isoOr, now, num, str } from '../db';
import { isSupabaseBackend } from '@/lib/backend';
import { credit } from '../ledger';

/* ============================================================================
   COUPONS
   ----------------------------------------------------------------------------
   `/coupons/{CODE}` — the document id IS the code, upper-cased, so a lookup is
   one read and two coupons cannot share a code.

     tokens          integer tokens credited to the earning balance
     adCredit        USD added to the advertiser deposit balance
     discountLabel   free text shown in the redemption list
     maxRedemptions  0 means unlimited
     redeemed        counter, incremented in the transaction
     onePerUser      when true, a per-user marker blocks a second redemption
     expiresAt       timestamp, or absent for no expiry
     enabled

   The per-user marker is `/coupons/{CODE}/redemptions/{uid}`, created inside the
   same transaction as the credit. That is what makes "one per user" hold under
   two simultaneous requests — the second `create` fails rather than both
   reading `redeemed: 0`.
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

  const couponRef = db().doc(`coupons/${code}`);
  const markerRef = db().doc(`coupons/${code}/redemptions/${args.uid}`);

  let prepared: { tokens: number; adCredit: number; label: string };

  if (isSupabaseBackend) {
    const {
      supabaseGetCoupon,
      supabaseRedeemCoupon,
      supabaseCountCouponRedemptions,
      supabaseUpdateRow,
    } = await import('../data-supabase');

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

    prepared = {
      tokens: Number(row.tokens ?? 0),
      adCredit: Number(row.ad_credit ?? 0),
      label: String(row.note ?? 'Coupon'),
    };
  } else {
    prepared = await db().runTransaction(async (tx) => {
      const [couponSnap, markerSnap] = await Promise.all([tx.get(couponRef), tx.get(markerRef)]);
      if (!couponSnap.exists) throw new AppError('That coupon does not exist.', 404, 'not_found');

      const data = couponSnap.data() as Record<string, unknown>;
      if (!bool(data.enabled, true)) throw new AppError('That coupon is no longer active.', 400, 'disabled');

      const expiresAt = iso(data.expiresAt);
      if (expiresAt && Date.parse(expiresAt) < Date.now()) {
        throw new AppError('That coupon has expired.', 400, 'expired');
      }

      const max = int(data.maxRedemptions);
      const redeemed = int(data.redeemed);
      if (max > 0 && redeemed >= max) {
        throw conflict('That coupon has been fully claimed.', 'exhausted');
      }

      if (bool(data.onePerUser, true) && markerSnap.exists) {
        throw conflict('You have already used that coupon.', 'already_redeemed');
      }

      tx.create(markerRef, { uid: args.uid, ip: args.ip, createdAt: now() });
      tx.update(couponRef, { redeemed: FieldValue.increment(1), updatedAt: now() });

      return {
        tokens: int(data.tokens),
        adCredit: num(data.adCredit),
        label: str(data.discountLabel, 'Coupon'),
      };
    });
  }

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
    if (isSupabaseBackend) {
      const { supabaseGetUser } = await import('../data-supabase');
      const { getServerSupabase } = await import('../supabase');
      const row = await supabaseGetUser(args.uid);
      const current = Number((row as Record<string, unknown> | null)?.deposit_balance ?? 0);
      await getServerSupabase()
        .from('users')
        .update({ deposit_balance: current + prepared.adCredit, updated_at: new Date().toISOString() })
        .eq('id', args.uid);
    } else {
      await db()
        .doc(`users/${args.uid}`)
        .update({ depositBalance: FieldValue.increment(prepared.adCredit), updatedAt: now() });
    }
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
  if (isSupabaseBackend) {
    const { supabaseListClaims } = await import('../data-supabase');
    const rows = await supabaseListClaims(uid, { limit, source: 'coupon', cursorIso: null });
    return rows.slice(0, limit).map((d) => ({
      id: String(d.id ?? ''),
      code: d.ref_id ? String(d.ref_id) : '—',
      balance: Number(d.amount ?? 0),
      adBalance: 0,
      discount: d.label ? String(d.label) : 'Coupon',
      at: d.created_at ? new Date(d.created_at as string).toISOString() : new Date().toISOString(),
    }));
  }

  const snap = await db()
    .collection(`users/${uid}/claims`)
    .where('source', '==', 'coupon')
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  return snap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      code: str(data.refId, '—'),
      balance: int(data.amount),
      adBalance: 0,
      discount: str(data.label, 'Coupon'),
      at: isoOr(data.createdAt),
    };
  });
}
