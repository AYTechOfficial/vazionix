import type { NextRequest } from 'next/server';

import { AppError } from '@/server/db';
import { clientIp, fail, ok } from '@/server/http';
import { handleOfferwallPostback } from '@/server/earn/offerwall';

/* ============================================================================
   /api/offerwall/[provider]   —  conversion postback
   ----------------------------------------------------------------------------
   GET and POST both accepted, because providers disagree and several do not let
   you choose. Parameters are read from the query string and the body alike, and
   the names below cover the field spellings the major walls use.

   YOUR POSTBACK URL, per provider:

     https://your-domain.com/api/offerwall/<providerId>
       ?uid={user_id}&tx={transaction_id}&reward={payout}&signature={hash}
       &status={status}&offer={offer_name}

   `<providerId>` is the document id in /offerwallProviders. The signature is
   verified against that document's `secret` and `signatureMode`.

   NOT AUTHENTICATED, AND THAT IS CORRECT
   The caller is the provider's server, not a signed-in user. The signature is
   the authentication, and an unsigned postback is recorded and refused rather
   than credited. Never add a session check here — it would break every
   provider.
   ========================================================================== */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FIELDS = {
  uid: ['uid', 'user_id', 'userId', 'sub_id', 'subid', 'sid', 'player_id', 'user'],
  tx: ['tx', 'trans_id', 'transaction_id', 'transactionId', 'txn_id', 'id', 'conversion_id'],
  reward: ['reward', 'payout', 'amount', 'currency_amount', 'points', 'value'],
  signature: ['signature', 'sig', 'hash', 'hashed', 'checksum'],
  status: ['status', 'state', 'event'],
  offer: ['offer', 'offer_name', 'offerName', 'name', 'campaign'],
} as const;

function pick(source: Record<string, string>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== '') return value;
  }
  return null;
}

function normaliseStatus(raw: string | null): 'Approved' | 'Pending' | 'Rejected' | 'Reversed' {
  const value = (raw ?? 'approved').toLowerCase();
  if (['2', 'reversed', 'chargeback', 'refund', 'refunded'].includes(value)) return 'Reversed';
  if (['0', 'pending', 'hold', 'held'].includes(value)) return 'Pending';
  if (['-1', 'rejected', 'declined', 'failed', 'void'].includes(value)) return 'Rejected';
  return 'Approved';
}

async function collect(request: NextRequest): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [key, value] of request.nextUrl.searchParams.entries()) out[key] = value;

  if (request.method === 'POST') {
    const type = request.headers.get('content-type') ?? '';
    try {
      if (type.includes('application/json')) {
        const body = (await request.json()) as Record<string, unknown>;
        for (const [key, value] of Object.entries(body)) {
          if (value !== null && value !== undefined && typeof value !== 'object') {
            out[key] = String(value);
          }
        }
      } else {
        const form = await request.formData();
        for (const [key, value] of form.entries()) out[key] = String(value);
      }
    } catch {
      // Query-string-only postbacks are common; an unparseable body is not fatal.
    }
  }

  return out;
}

async function process(request: NextRequest, providerId: string) {
  const params = await collect(request);

  const uid = pick(params, FIELDS.uid);
  const tx = pick(params, FIELDS.tx);
  const reward = pick(params, FIELDS.reward);

  if (!uid || !tx) {
    return fail('Missing user id or transaction id.', 400, 'missing_fields');
  }

  const result = await handleOfferwallPostback({
    providerId,
    transactionId: tx,
    uid,
    reward: Math.round(Number(reward ?? 0)),
    status: normaliseStatus(pick(params, FIELDS.status)),
    offerName: pick(params, FIELDS.offer) ?? 'Offer',
    signature: pick(params, FIELDS.signature),
    ip: clientIp(request),
    raw: params,
  });

  /* Most walls treat a bare "1" or "ok" as success and retry on anything else.
     The JSON body is for your own logs; the 200 is what stops the retries. */
  return ok(result);
}

export async function GET(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params;
  try {
    return await process(request, provider);
  } catch (error) {
    if (error instanceof AppError) return fail(error.message, error.status, error.code);
    console.error('[offerwall] postback failed', error);
    return fail('Postback failed.', 500, 'internal');
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  return GET(request, context);
}
