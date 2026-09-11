import 'server-only';

import type { CoinTicker, PayoutRailName } from '@/lib/models';

import { getRates } from './config';
import { AppError, int, str } from './db';
import { bumpStat } from './stats';
import { pushNotification } from './users';
import { refundLocked } from './withdraw';
import { rpcSetWithdrawalStatus } from './supabase';
import { supabaseGetWithdrawal, supabaseClaimWithdrawal, supabaseUpdateWithdrawal } from './data-supabase';

/* ============================================================================
   PAYOUT RAILS — sending the money
   ----------------------------------------------------------------------------
   Three adapters behind one interface. Which one runs is decided by the
   withdrawal's `rail`, and each is enabled purely by the presence of its
   credentials — an unconfigured rail refuses rather than pretending to send.

     FaucetPay  live API, settles in seconds. Needs FAUCETPAY_API_KEY.
     CWallet    live API, settles in seconds. Needs CWALLET_API_KEY.
     Direct     on-chain. Deliberately NOT automated here: signing keys do not
                belong in a web app process. Approving a Direct payout marks it
                Processing and records the operator; broadcast happens in your
                custody tooling and `settleWithdrawal` records the txid.

   FAIL CLOSED, EVERY TIME
   A send that errors, times out, or returns an unrecognised body leaves the
   withdrawal Pending/Processing and the tokens locked. It never marks Completed
   on uncertainty. Paying twice is unrecoverable; paying late is a support
   reply.
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
  const row = await supabaseGetWithdrawal(withdrawalId);
  if (!row) throw new AppError404('Withdrawal not found.');

  const status = str(row.status);
  if (status === 'Completed') {
    return { status, txid: row.txid ? str(row.txid) : null, detail: 'Already completed.' };
  }
  if (status === 'Rejected' || status === 'Reversed') {
    throw new AppError409(`Cannot approve a ${status.toLowerCase()} withdrawal.`);
  }

  /* Claim the withdrawal before calling out, so two operators clicking Approve
     at the same moment cannot both send. Only a row still Pending/HeldForReview
     transitions; a Processing row claims nobody and the RPC keeps it that way. */
  const claim = await supabaseClaimWithdrawal(withdrawalId, actorUid);
  if (!claim.claimed) {
    const fresh = await supabaseGetWithdrawal(withdrawalId);
    if (str(fresh?.status) === 'Completed') {
      return { status: 'Completed', txid: fresh?.txid ? str(fresh.txid) : null, detail: 'Already completed.' };
    }
    throw new AppError409('Another operator is already processing this payout.');
  }

  const result = await sendPayout({
    coin: str(row.coin, 'USDT') as CoinTicker,
    rail: str(row.rail, 'FaucetPay') as PayoutRailName,
    address: str(row.address),
    amount: str(row.receive_amount ?? row.amount, '0'),
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

  /* Uncertain. Stay Processing with the tokens locked, and surface the reason
     to the operator rather than guessing. */
  await supabaseUpdateWithdrawal(withdrawalId, { failure_reason: result.detail });
  return { status: 'Processing', txid: null, detail: result.detail };
}

/** Mark a payout as sent. Also used to record a Direct on-chain txid. */
export async function settleWithdrawal(
  withdrawalId: string,
  txid: string,
  actorUid: string,
): Promise<void> {
  const row = await supabaseGetWithdrawal(withdrawalId);
  if (!row) throw new AppError404('Withdrawal not found.');
  if (str(row.status) === 'Completed') return;

  const uid = str(row.user_id);
  const tokens = int(row.token_cost);
  const usd = Number(row.usd_value ?? 0) || 0;

  /* The RPC performs the status write AND the locked-balance release in one
     transaction, so a completed payout can never leave locked tokens behind. */
  const res = await rpcSetWithdrawalStatus({ id: withdrawalId, status: 'Completed', actor: actorUid, txid });
  if (!res.ok) throw new AppError409(res.error ?? 'Could not settle the payout.');

  await bumpStat({ withdrawals: 1, tokensWithdrawn: tokens, usdWithdrawn: usd });
  await pushNotification(uid, {
    icon: 'checkCircle',
    tone: 'success',
    title: 'Withdrawal completed',
    body: `${str(row.receive_amount, str(row.amount))} ${str(row.coin)} sent.`,
    href: '/transactions',
  });
}

export async function rejectWithdrawal(
  withdrawalId: string,
  actorUid: string,
  reason: string,
): Promise<void> {
  const row = await supabaseGetWithdrawal(withdrawalId);
  if (!row) throw new AppError404('Withdrawal not found.');

  const status = str(row.status);
  if (status === 'Rejected') return;
  if (status === 'Completed') {
    throw new AppError409('That payout already went out. Use a reversal instead.');
  }

  const res = await rpcSetWithdrawalStatus({
    id: withdrawalId, status: 'Rejected', actor: actorUid, failure: reason,
  });
  if (!res.ok) throw new AppError409(res.error ?? 'Could not reject the payout.');

  const uid = str(row.user_id);
  await refundLocked(uid, int(row.token_cost), withdrawalId, reason);
  await pushNotification(uid, {
    icon: 'ticket',
    tone: 'warning',
    title: 'Withdrawal returned',
    body: `${int(row.token_cost).toLocaleString('en-US')} tokens are back in your balance. ${reason}`,
    href: '/withdraw',
  });
}

/** USD value of everything currently queued, for the admin treasury card. */
export async function pendingPayoutTotal(): Promise<{ count: number; usd: number; tokens: number }> {
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

/* Small local error subclasses so the operator routes get precise statuses. */
class AppError404 extends AppError {
  constructor(message: string) { super(message, 404, 'not_found'); }
}
class AppError409 extends AppError {
  constructor(message: string) { super(message, 409, 'bad_state'); }
}

export { getRates };
