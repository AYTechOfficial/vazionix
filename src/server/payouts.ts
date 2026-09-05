import 'server-only';

import type { CoinTicker, PayoutRailName } from '@/lib/models';

import { getRates } from './config';
import { isSupabaseBackend } from '@/lib/backend';
import { AppError, FieldValue, db, int, now, str } from './db';
import { bumpStat } from './stats';
import { pushNotification } from './users';
import { refundLocked } from './withdraw';

/* ============================================================================
   PAYOUT RAILS — sending the money
   ----------------------------------------------------------------------------
   Three adapters behind one interface. Which one runs is decided by the
   withdrawal's `rail`, and each is enabled purely by the presence of its
   credentials — an unconfigured rail refuses rather than pretending to send.

     FaucetPay  live API, settles in seconds. Needs FAUCETPAY_API_KEY.
     CWallet    live API, settles in seconds. Needs CWALLET_API_KEY (+ secret).
     Direct     on-chain. Deliberately NOT automated here: signing keys do not
                belong in a web app process. Approving a Direct payout marks it
                Processing and records the operator; broadcast happens in your
                custody tooling and `settleWithdrawal` records the txid.

   FAIL CLOSED, EVERY TIME
   A send that errors, times out, or returns an unrecognised body leaves the
   withdrawal Pending and the tokens locked. It never marks Completed on
   uncertainty. Paying twice is unrecoverable; paying late is a support reply.
   ========================================================================== */

export interface SendResult {
  ok: boolean;
  txid: string | null;
  /** Operator-facing detail. Not shown to the user verbatim. */
  detail: string;
  /** True when the provider explicitly rejected — safe to refund. */
  rejected: boolean;
}

export interface SendInput {
  coin: CoinTicker;
  rail: PayoutRailName;
  address: string;
  /** Asset amount as a decimal string, net of fee. */
  amount: string;
  withdrawalId: string;
}

/* ---- FAUCETPAY ------------------------------------------------------------ */

async function sendFaucetPay(input: SendInput): Promise<SendResult> {
  const key = (process.env.FAUCETPAY_API_KEY ?? '').trim();
  if (!key) {
    return { ok: false, txid: null, detail: 'FAUCETPAY_API_KEY is not set.', rejected: false };
  }

  try {
    const response = await fetch('https://faucetpay.io/api/v1/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        api_key: key,
        to: input.address,
        amount: input.amount,
        currency: input.coin,
        referral: 'false',
        ip_address: '',
      }).toString(),
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    });

    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const status = int(body.status, response.status);

    if (status === 200) {
      return {
        ok: true,
        txid: str(body.payout_id, str(body.payout_user_hash, input.withdrawalId)),
        detail: 'FaucetPay accepted the payout.',
        rejected: false,
      };
    }

    /* 456/457 and friends are explicit refusals (bad address, insufficient
       merchant balance). Those are safe to refund; anything else might have
       been received and must stay locked. */
    const rejected = [400, 403, 404, 456, 457, 458].includes(status);
    return {
      ok: false,
      txid: null,
      detail: `FaucetPay ${status}: ${str(body.message, 'no message')}`,
      rejected,
    };
  } catch (error) {
    return {
      ok: false,
      txid: null,
      detail: `FaucetPay request failed: ${(error as Error).message}`,
      rejected: false,
    };
  }
}

/* ---- CWALLET -------------------------------------------------------------- */

async function sendCWallet(input: SendInput): Promise<SendResult> {
  const key = (process.env.CWALLET_API_KEY ?? '').trim();
  const endpoint = (process.env.CWALLET_API_URL ?? 'https://openapi.cwallet.com/v1/transfer').trim();
  if (!key) {
    return { ok: false, txid: null, detail: 'CWALLET_API_KEY is not set.', rejected: false };
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        coin: input.coin,
        amount: input.amount,
        receiver: input.address,
        /* The provider's own idempotency key. Sending the same one twice is a
           no-op on their side, which is the second line of defence after ours. */
        clientOrderId: input.withdrawalId,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    });

    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const okFlag = body.success === true || int(body.code, -1) === 0 || response.status === 200;

    if (okFlag && response.ok) {
      const data = (body.data ?? {}) as Record<string, unknown>;
      return {
        ok: true,
        txid: str(data.transferId, str(body.transferId, input.withdrawalId)),
        detail: 'CWallet accepted the transfer.',
        rejected: false,
      };
    }

    return {
      ok: false,
      txid: null,
      detail: `CWallet ${response.status}: ${str(body.message, 'no message')}`,
      rejected: [400, 403, 404, 422].includes(response.status),
    };
  } catch (error) {
    return {
      ok: false,
      txid: null,
      detail: `CWallet request failed: ${(error as Error).message}`,
      rejected: false,
    };
  }
}

/* ---- DISPATCH ------------------------------------------------------------- */

export async function sendPayout(input: SendInput): Promise<SendResult> {
  switch (input.rail) {
    case 'FaucetPay':
      return sendFaucetPay(input);
    case 'CWallet':
      return sendCWallet(input);
    case 'Direct':
      return {
        ok: false,
        txid: null,
        detail: 'Direct on-chain payouts are broadcast from custody tooling, not from the app.',
        rejected: false,
      };
    default:
      return { ok: false, txid: null, detail: `Unknown rail ${input.rail}.`, rejected: true };
  }
}

/** Which rails can actually send right now, for the admin queue's buttons. */
export function railStatus(): Record<PayoutRailName, { automated: boolean; configured: boolean }> {
  return {
    FaucetPay: { automated: true, configured: Boolean((process.env.FAUCETPAY_API_KEY ?? '').trim()) },
    CWallet: { automated: true, configured: Boolean((process.env.CWALLET_API_KEY ?? '').trim()) },
    Direct: { automated: false, configured: true },
  };
}

/* ---- OPERATOR ACTIONS ---------------------------------------------------- */

/**
 * Approve and attempt to send. Called by Admin → Payouts and by the batch job.
 * Idempotent on `status`: a withdrawal already Completed is returned untouched.
 */
export async function approveWithdrawal(
  withdrawalId: string,
  actorUid: string,
): Promise<{ status: string; txid: string | null; detail: string }> {
  const ref = db().doc(`withdrawals/${withdrawalId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new AppError('Withdrawal not found.', 404, 'not_found');

  const data = snap.data() as Record<string, unknown>;
  const status = str(data.status);
  if (status === 'Completed') {
    return { status, txid: data.txid ? str(data.txid) : null, detail: 'Already completed.' };
  }
  if (status === 'Rejected' || status === 'Reversed') {
    throw new AppError(`Cannot approve a ${status.toLowerCase()} withdrawal.`, 409, 'bad_state');
  }

  /* Claim the withdrawal before calling out, so two operators clicking Approve
     at the same moment cannot both send. */
  await db().runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    if (str(fresh.get('status')) === 'Processing') {
      throw new AppError('Another operator is already processing this payout.', 409, 'in_flight');
    }
    tx.update(ref, {
      status: 'Processing',
      reviewedBy: actorUid,
      processingStartedAt: now(),
      updatedAt: now(),
    });
  });

  const result = await sendPayout({
    coin: str(data.coin, 'USDT') as CoinTicker,
    rail: str(data.rail, 'FaucetPay') as PayoutRailName,
    address: str(data.address),
    amount: str(data.receiveAmount, str(data.amount, '0')),
    withdrawalId,
  });

  if (result.ok) {
    await settleWithdrawal(withdrawalId, result.txid ?? withdrawalId, actorUid);
    return { status: 'Completed', txid: result.txid, detail: result.detail };
  }

  if (result.rejected) {
    await rejectWithdrawal(withdrawalId, actorUid, result.detail);
    return { status: 'Rejected', txid: null, detail: result.detail };
  }

  /* Uncertain. Stay Processing with the tokens locked, and surface the reason to
     the operator rather than guessing. */
  await ref.update({ failureReason: result.detail, updatedAt: now() });
  return { status: 'Processing', txid: null, detail: result.detail };
}

/** Mark a payout as sent. Also used to record a Direct on-chain txid. */
export async function settleWithdrawal(
  withdrawalId: string,
  txid: string,
  actorUid: string,
): Promise<void> {
  const ref = db().doc(`withdrawals/${withdrawalId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new AppError('Withdrawal not found.', 404, 'not_found');

  const data = snap.data() as Record<string, unknown>;
  if (str(data.status) === 'Completed') return;

  const uid = str(data.uid);
  const tokens = int(data.tokenCost);
  const usd = Number(str(data.usdValue, '0')) || 0;

  await db().runTransaction(async (tx) => {
    tx.update(ref, {
      status: 'Completed',
      txid,
      processedAt: now(),
      reviewedBy: actorUid,
      failureReason: null,
      updatedAt: now(),
    });
    /* The locked tokens are now genuinely gone: they left the platform. */
    tx.update(db().doc(`users/${uid}`), {
      lockedBalance: FieldValue.increment(-tokens),
      updatedAt: now(),
    });
  });

  await bumpStat({ withdrawals: 1, tokensWithdrawn: tokens, usdWithdrawn: usd });
  await pushNotification(uid, {
    icon: 'checkCircle',
    tone: 'success',
    title: 'Withdrawal completed',
    body: `${str(data.receiveAmount, str(data.amount))} ${str(data.coin)} sent.`,
    href: '/transactions',
  });
}

export async function rejectWithdrawal(
  withdrawalId: string,
  actorUid: string,
  reason: string,
): Promise<void> {
  const ref = db().doc(`withdrawals/${withdrawalId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new AppError('Withdrawal not found.', 404, 'not_found');

  const data = snap.data() as Record<string, unknown>;
  const status = str(data.status);
  if (status === 'Rejected') return;
  if (status === 'Completed') {
    throw new AppError('That payout already went out. Use a reversal instead.', 409, 'bad_state');
  }

  await ref.update({
    status: 'Rejected',
    failureReason: reason,
    reviewedBy: actorUid,
    processedAt: now(),
    updatedAt: now(),
  });

  await refundLocked(str(data.uid), int(data.tokenCost), withdrawalId, reason);
  await pushNotification(str(data.uid), {
    icon: 'ticket',
    tone: 'warning',
    title: 'Withdrawal returned',
    body: `${int(data.tokenCost).toLocaleString('en-US')} tokens are back in your balance. ${reason}`,
    href: '/withdraw',
  });
}

/** USD value of everything currently queued, for the admin treasury card. */
export async function pendingPayoutTotal(): Promise<{ count: number; usd: number; tokens: number }> {
  if (isSupabaseBackend) {
    const { supabaseQueuedWithdrawals } = await import('./data-supabase');
    const rows = await supabaseQueuedWithdrawals(500);
    let usd = 0;
    let tokens = 0;
    for (const row of rows) {
      /* The Supabase row keeps the quote rather than a denormalised usdValue, so
         the total is derived from the price the user was actually shown. */
      const perUnit = Number(row.quoted_usd_per_unit ?? 0) || 0;
      const amount = Number(row.amount ?? 0) || 0;
      usd += perUnit * amount;
      tokens += Number(row.token_cost ?? 0);
    }
    return { count: rows.length, usd, tokens };
  }

  const snap = await db()
    .collection('withdrawals')
    .where('status', 'in', ['Pending', 'HeldForReview', 'Processing'])
    .limit(500)
    .get();

  let usd = 0;
  let tokens = 0;
  for (const doc of snap.docs) {
    usd += Number(str(doc.get('usdValue'), '0')) || 0;
    tokens += int(doc.get('tokenCost'));
  }
  return { count: snap.size, usd, tokens };
}

export { getRates };
