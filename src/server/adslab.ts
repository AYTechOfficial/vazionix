import 'server-only';

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { ADSLAB_PLACEMENTS } from '@/lib/adslab/config';
import { getRates } from './config';
import { credit, debit } from './ledger';
import { getServerSupabase, isServerSupabaseReady } from './supabase';
import { bumpStat } from './stats';

/* ============================================================================
   ADSLAB — SERVER SIDE
   ----------------------------------------------------------------------------
   The API key and the security hash live here and nowhere else. `server-only`
   makes importing this file from a Client Component a BUILD error, which is the
   guardrail that matters: either secret in the browser bundle lets anyone forge
   a postback and mint themselves a balance.

   TWO SIGNATURE SCHEMES, DELIBERATELY KEPT APART
     GET postback   sha256("<txid>-<key>")                      — plain hash
     Captcha hook   hmac_sha256("<sub_id>:<timestamp>", secret)  — HMAC
   Mixing them up silently accepts forged traffic, so they are separate
   functions with no shared branch.

   WHICH KEY SIGNS THE POSTBACK IS AMBIGUOUS IN ADSLAB'S OWN DOCS
   Their prose calls the Publisher API Key the "security hash"; their PHP example
   uses the secretKey. Rather than guess, `verifyPostbackSignature` tries both and
   reports which matched. The match is recorded on every audit row
   (`adslab_transactions.signed_with`), so after the first live conversion you can
   read it off real traffic and pin it. Accepting either is not a weakness here:
   both values are server-only secrets of the same account.
   ========================================================================== */

const API_KEY = process.env.ADSLAB_API_KEY ?? '';
const SECRET_KEY = process.env.ADSLAB_SECRET_KEY ?? '';

export const adslabServerReady = Boolean(API_KEY && SECRET_KEY);

export const ADSLAB_SERVER = {
  get apiKey() {
    return API_KEY;
  },
  get secret() {
    return SECRET_KEY;
  },
} as const;

/** Constant-time compare. `===` on a signature leaks its bytes through timing. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function verifyPostbackSignature(
  txid: string,
  received: string,
): { valid: boolean; which: 'secret' | 'apikey' | null } {
  if (!received || !adslabServerReady) return { valid: false, which: null };

  const candidates: Array<['secret' | 'apikey', string]> = [
    ['secret', createHash('sha256').update(`${txid}-${SECRET_KEY}`).digest('hex')],
    ['apikey', createHash('sha256').update(`${txid}-${API_KEY}`).digest('hex')],
  ];

  for (const [which, expected] of candidates) {
    if (safeEqual(expected, received)) return { valid: true, which };
  }
  return { valid: false, which: null };
}

/** HMAC-SHA256 over "<sub_id>:<timestamp>", keyed by the secret. */
export function verifyCaptchaSignature(
  subId: string,
  timestamp: string | number,
  received: string,
): boolean {
  if (!received || !adslabServerReady) return false;
  const expected = createHmac('sha256', SECRET_KEY)
    .update(`${subId}:${timestamp}`)
    .digest('hex');
  return safeEqual(expected, received);
}

/** Which placement a postback came from. Unknown ids are treated as tasks,
    because that is the only placement whose payout AdsLab actually sends. */
export function sourceForPlacement(pid: string): 'interstitial' | 'rewarded' | 'task' {
  if (pid && pid === ADSLAB_PLACEMENTS.interstitial) return 'interstitial';
  if (pid && pid === ADSLAB_PLACEMENTS.rewarded) return 'rewarded';
  return 'task';
}

/* ---- PAYOUT ---------------------------------------------------------------
   Interstitial and rewarded postbacks carry NO reward parameter, so the payout
   is ours to decide. These are USD, converted to tokens below.

   Set them deliberately: an interstitial that pays more than its eCPM turns
   every impression into a loss. 0 means "record the impression, credit nothing",
   which is the safe default until you know your own rate. */
const AD_PAYOUT_USD: Record<'interstitial' | 'rewarded', number> = {
  interstitial: 0,
  rewarded: 0.0005,
};

/** USD -> integer tokens at the live rate. Rounds DOWN so the house never pays
    a fraction of a token it did not mean to. */
export async function usdToTokens(usd: number): Promise<number> {
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  const { usdPerToken } = await getRates();
  if (!usdPerToken || usdPerToken <= 0) return 0;
  return Math.floor(usd / usdPerToken);
}

/* ---- CREDIT --------------------------------------------------------------- */

export type AdslabSource = 'interstitial' | 'rewarded' | 'task' | 'captcha';

export interface AdslabCreditInput {
  txid: string;
  /** Raw uid from the provider. Resolved against public.users. */
  uid: string;
  placementId?: string;
  source: AdslabSource;
  taskType?: string | null;
  /** USD as reported by AdsLab. Ignored for interstitial/rewarded. */
  rewardUsd?: number;
  status: string;
  campaignName?: string | null;
  ip?: string | null;
  country?: string | null;
  rawQuery?: string | null;
  signedWith?: string | null;
  /** Overrides the payout table and the USD conversion (captcha faucet payout). */
  tokensOverride?: number;
}

export type AdslabCreditResult = 'credited' | 'duplicate' | 'reversed' | 'ignored' | 'recorded';

const REVERSAL_STATUSES = new Set(['chargeback', 'reversed', 'rejected']);

/**
 * The single funnel every AdsLab reward passes through.
 *
 * Two writes, in this order, and the order matters:
 *   1. INSERT the audit row. Its UNIQUE txid is the duplicate guard — if this
 *      loses, the postback is a retry and we return 'duplicate' having touched
 *      no balance.
 *   2. Move the money through credit()/debit(), which are themselves idempotent
 *      on `adslab_<txid>`. So even if step 1 somehow let a duplicate through,
 *      the ledger still refuses to pay twice. Two independent guards on the same
 *      fact is deliberate: this endpoint is unauthenticated and money-bearing.
 */
export async function creditFromAdslab(input: AdslabCreditInput): Promise<AdslabCreditResult> {
  if (!isServerSupabaseReady()) return 'ignored';

  const supabase = getServerSupabase();
  const status = (input.status || 'completed').toLowerCase();
  const isReversal = REVERSAL_STATUSES.has(status);

  /* Resolve the provider's uid to a real account. An unknown uid is RECORDED and
     then ignored: AdsLab must still get a 200 or it retries forever, and the row
     is the only evidence we will have if the user later disputes it. */
  let userId: string | null = null;
  try {
    const { data } = await supabase.from('users').select('id').eq('id', input.uid).maybeSingle();
    userId = data?.id ? String(data.id) : null;
  } catch {
    userId = null;
  }

  const usd =
    input.source === 'task' || input.source === 'captcha'
      ? Math.max(0, Number(input.rewardUsd ?? 0) || 0)
      : AD_PAYOUT_USD[input.source];

  const tokens =
    typeof input.tokensOverride === 'number'
      ? Math.max(0, Math.floor(input.tokensOverride))
      : await usdToTokens(usd);

  const auditRow = {
    txid: input.txid,
    user_id: userId,
    raw_uid: input.uid,
    placement_id: input.placementId ?? null,
    source: input.source,
    task_type: input.taskType ?? null,
    reward_usd: usd,
    tokens: isReversal ? -tokens : tokens,
    status,
    campaign_name: input.campaignName ?? null,
    ip: input.ip ?? null,
    country: input.country ?? null,
    raw_query: input.rawQuery ?? null,
    signed_with: input.signedWith ?? null,
  };

  const { error } = await supabase.from('adslab_transactions').insert(auditRow);
  if (error) {
    // 23505 = unique_violation on txid: a retry of something already handled.
    if ((error as { code?: string }).code === '23505') return 'duplicate';
    console.error('[adslab] audit insert failed', error);
    return 'ignored';
  }

  if (!userId) {
    console.warn('[adslab] postback for unknown uid', { uid: input.uid, txid: input.txid });
    return 'ignored';
  }

  if (tokens <= 0) {
    // A recorded impression that pays nothing (interstitial at 0) is not a bug.
    return 'recorded';
  }

  const label =
    input.source === 'captcha'
      ? 'Captcha claim'
      : input.source === 'task'
        ? `AdsLab task${input.taskType ? ` — ${input.taskType}` : ''}`
        : `AdsLab ${input.source}`;

  try {
    if (isReversal) {
      /* A reversal takes the tokens back with its OWN idempotency key, so a
         chargeback replayed by the provider cannot deduct twice. */
      await debit({
        uid: userId,
        amount: tokens,
        source: 'refund',
        label: `${label} reversed`,
        refId: input.txid,
        idempotencyKey: `adslabrev_${input.txid}`,
      });
      return 'reversed';
    }

    await credit({
      uid: userId,
      source: input.source === 'captcha' ? 'bonus' : 'offerwall',
      amount: tokens,
      exp: Math.max(1, Math.floor(tokens / 100)),
      label,
      refId: input.txid,
      idempotencyKey: `adslab_${input.txid}`,
      applyBonus: false,
      ip: input.ip ?? null,
      meta: {
        provider: 'AdsLab',
        placementId: input.placementId ?? null,
        taskType: input.taskType ?? null,
        rewardUsd: usd,
      },
    });

    await bumpStat({ offerwallConversions: input.source === 'task' ? 1 : 0, adImpressions: 1 });
    return 'credited';
  } catch (err) {
    /* The audit row is already written, so the payout is recoverable by hand.
       Reporting 'ignored' keeps the 200 contract with AdsLab; a 500 here would
       make them retry a postback whose audit row now exists, which would then be
       rejected as a duplicate and the reward lost silently. */
    console.error('[adslab] credit failed after audit row written', {
      txid: input.txid,
      uid: userId,
      err,
    });
    return 'ignored';
  }
}