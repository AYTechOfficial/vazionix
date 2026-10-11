import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

import type { OfferConversion, OfferProviderItem } from '@/lib/models';

import { AppError, bool, int, num, str } from '../db';
import {
  supabaseGetConversionById,
  supabaseGetConversionByProviderTx,
  supabaseGetRow,
  supabaseInsertConversion,
  supabaseListConversions,
  supabaseListEnabled,
  supabaseUpdateConversion,
} from '../data-supabase';
import { credit } from '../ledger';
import { bumpStat } from '../stats';
import { pushNotification } from '../users';

/* ============================================================================
   OFFERWALL
   ----------------------------------------------------------------------------
   Nine-odd providers, one contract. Each provider is a row in the
   `offerwall_providers` table:

     name, blurb, rating, mark, hue, url (url_template), secret, signature_mode,
     enabled, featured

   `url_template` accepts `{uid}`, `{username}` and `{country}` placeholders,
   which is how a provider identifies your user inside their wall.

   THE POSTBACK IS THE WHOLE SECURITY SURFACE
   A conversion arrives as an HTTP GET or POST from the provider's servers. Two
   things make it safe to credit from:

   1. SIGNATURE. Every provider signs the payload with a shared secret — most as
      `md5(id + reward + secret)` or an HMAC. `verifyPostbackSignature` handles
      the shapes in use; an unsigned or wrongly-signed postback is recorded and
      NOT credited, so a forged one is visible rather than silent.

   2. IDEMPOTENCY BY ROW KEY. The conversion's `provider_conversion_id` IS the
      provider's transaction id. Providers retry postbacks routinely — some send
      the same conversion five times over an hour — and a unique constraint on
      that column makes the second insert fail, which is exactly the behaviour
      we want. This is why conversions are their own top-level table rather than
      a nested part of the user.
   ========================================================================== */

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => encodeURIComponent(vars[key] ?? ''));
}

export async function listOfferProviders(viewer: {
  uid: string;
  username: string;
  countryCode: string;
} | null): Promise<OfferProviderItem[]> {
  const list = await supabaseListEnabled('offerwall_providers', 'rating', 50);
  const rows: Array<{ id: string; data: Record<string, unknown> }> = list.map((r: Record<string, unknown>) => ({
    id: String(r.id),
    // `url_template` is the column that holds the provider's wall URL.
    data: { ...r, iframeUrl: r.url_template ?? r.url },
  }));

  return rows.map(({ id, data }) => {
    const template = str(data.iframeUrl);
    return {
      id,
      name: str(data.name, id),
      rating: num(data.rating, 4),
      mark: str(data.mark, str(data.name, id).slice(0, 2).toUpperCase()),
      hue: int(data.hue, 160),
      blurb: str(data.blurb),
      url:
        template && viewer
          ? fill(template, {
              uid: viewer.uid,
              username: viewer.username,
              country: viewer.countryCode,
            })
          : null,
      enabled: bool(data.enabled, true),
      featured: bool(data.featured),
    };
  });
}

export async function listConversions(
  uid: string,
  limit = 50,
): Promise<OfferConversion[]> {
  const rows = await supabaseListConversions(uid, limit);
  return rows.map((d: Record<string, unknown>) => ({
    id: String(d.id ?? ''),
    provider: String(d.provider ?? 'Provider'),
    status: (String(d.status ?? 'Pending') as OfferConversion['status']),
    reward: Number(d.reward ?? 0),
    at: d.created_at ? new Date(d.created_at as string).toISOString() : new Date().toISOString(),
    offerName: String((d.raw_payload as Record<string, unknown> | null)?.offerName ?? 'Offer'),
  }));
}

/* ---- POSTBACK ------------------------------------------------------------- */

export interface PostbackInput {
  providerId: string;
  /** The provider's own transaction id. Becomes the row key. */
  transactionId: string;
  uid: string;
  reward: number;
  status: 'Approved' | 'Pending' | 'Rejected' | 'Reversed';
  offerName?: string;
  signature?: string | null;
  ip: string | null;
  raw: Record<string, unknown>;
}

export interface PostbackResult {
  ok: boolean
  credited: number;
  status: string;
  duplicate: boolean;
  message: string;
}

function signaturesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a.toLowerCase());
  const right = Buffer.from(b.toLowerCase());
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function expectedSignature(
  mode: string,
  secret: string,
  input: PostbackInput,
): string | null {
  switch (mode) {
    case 'md5_tx_reward_secret':
      return createHmac('md5', secret).update(`${input.transactionId}${input.reward}`).digest('hex');
    case 'hmac_sha256_payload':
      return createHmac('sha256', secret)
        .update(`${input.uid}:${input.transactionId}:${input.reward}`)
        .digest('hex');
    case 'sha256_uid_reward_secret':
      return createHmac('sha256', secret).update(`${input.uid}${input.reward}`).digest('hex');
    case 'none':
      return null;
    default:
      return createHmac('sha256', secret)
        .update(`${input.uid}:${input.transactionId}:${input.reward}`)
        .digest('hex');
  }
}

export async function handleOfferwallPostback(input: PostbackInput): Promise<PostbackResult> {
  const row = await supabaseGetRow('offerwall_providers', input.providerId);
  if (!row) throw new AppError('Unknown offerwall provider.', 404, 'unknown_provider');
  const provider: Record<string, unknown> = { ...row, signatureMode: row.signature_mode };

  const secret = str(provider.secret);
  const mode = str(provider.signatureMode, 'hmac_sha256_payload');
  const expected = secret ? expectedSignature(mode, secret, input) : null;

  let signatureValid = true;
  if (expected) {
    signatureValid = Boolean(input.signature) && signaturesMatch(expected, input.signature!);
  } else if (mode !== 'none') {
    // A provider with no secret configured cannot be trusted to credit from.
    signatureValid = false;
  }

  const docId = `${input.providerId}_${input.transactionId}`.replace(/[^\w.-]/g, '_').slice(0, 400);

  const reward = Math.max(0, Math.floor(input.reward));
  const providerName = str(provider.name, input.providerId);

  const inserted = await supabaseInsertConversion({
    provider: providerName,
    provider_conversion_id: docId,
    user_id: input.uid,
    reward,
    status: input.status,
    raw_payload: { ...input.raw, offerName: input.offerName ?? 'Offer', ip: input.ip },
    signature_valid: signatureValid,
    credited_at: null,
  });

  if (!inserted) {
    /* Already seen. Providers retry constantly; the normal path, not an error,
       and it must not credit again. */
    const existing = await supabaseGetConversionByProviderTx(docId);
    return {
      ok: true,
      credited: Number(existing?.reward ?? 0),
      status: String(existing?.status ?? 'Approved'),
      duplicate: true,
      message: 'Already processed.',
    };
  }

  if (!signatureValid) {
    await supabaseUpdateConversion(docId, { status: 'Rejected', rejection_reason: 'signature' });
    throw new AppError('Signature verification failed.', 401, 'bad_signature');
  }

  if (input.status !== 'Approved' || reward <= 0) {
    return { ok: true, credited: 0, status: input.status, duplicate: false, message: `Recorded as ${input.status}.` };
  }

  const result = await credit({
    uid: input.uid,
    source: 'offerwall',
    amount: reward,
    exp: Math.max(1, Math.floor(reward / 20)),
    label: `Offerwall — ${providerName}`,
    refId: docId,
    idempotencyKey: `ow_${docId}`,
    ip: input.ip,
    meta: { provider: providerName, offerName: input.offerName ?? 'Offer' },
  });

  await supabaseUpdateConversion(docId, {
    credited_at: new Date().toISOString(),
    credited_tokens: result.credited,
  });
  await bumpStat({ offerwallConversions: 1 });
  await pushNotification(input.uid, {
    icon: 'coins',
    tone: 'mint',
    title: 'Offerwall credited',
    body: `${providerName} approved +${result.credited.toLocaleString('en-US')} tokens.`,
    href: '/offerwall/history',
  });

  return { ok: true, credited: result.credited, status: 'Approved', duplicate: result.replayed, message: 'Credited.' };
}

/** Reverse a conversion an advertiser later charged back. */
export async function reverseConversion(conversionId: string, actorUid: string): Promise<void> {
  const { debit } = await import('../ledger');

  const row = await supabaseGetConversionById(conversionId);
  if (!row) throw new AppError('Conversion not found.', 404, 'not_found');
  if (String(row.status) === 'Reversed') return;

  const tokens = Number(row.credited_tokens ?? row.reward ?? 0);
  const uid = String(row.user_id ?? '');
  const providerName = String(row.provider ?? 'Offerwall');

  await debit({
    uid,
    amount: tokens,
    source: 'refund',
    label: `Offerwall reversal — ${providerName}`,
    refId: conversionId,
    idempotencyKey: `owrev_${conversionId}`,
  });

  await supabaseUpdateConversion(String(row.provider_conversion_id), {
    status: 'Reversed',
    reversed_at: new Date().toISOString(),
    reversed_by: actorUid,
  });
  await pushNotification(uid, {
    icon: 'ticket',
    tone: 'warning',
    title: 'Offerwall conversion reversed',
    body: `${providerName} charged back ${tokens.toLocaleString('en-US')} tokens.`,
    href: '/offerwall/history',
  });
}
