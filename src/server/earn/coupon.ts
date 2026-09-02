import 'server-only';

import type { CouponRow } from '@/lib/models';

import { AppError, FieldValue, bool, conflict, db, int, iso, isoOr, now, num, str } from '../db';
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

  const prepared = await db().runTransaction(async (tx) => {
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
    await db()
      .doc(`users/${args.uid}`)
      .update({ depositBalance: FieldValue.increment(prepared.adCredit), updatedAt: now() });
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
