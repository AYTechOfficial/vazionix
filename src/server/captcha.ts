import 'server-only';

import { createHash } from 'node:crypto';

import { CAPTCHA_PROVIDERS, captchaEnabled, captchaProvider } from '@/lib/captcha/config';

import { AppError, db, isServerFirebaseReady, now } from './db';
import { isSupabaseBackend } from '@/lib/backend';

/* ============================================================================
   CAPTCHA VERIFICATION (server)
   ----------------------------------------------------------------------------
   The only check that counts. Three properties, all necessary:

   1. SECRET-KEYED. The token is presented to the provider together with the
      secret key, which never leaves the server. A client cannot forge a
      provider's "yes".

   2. SINGLE-USE. A verified token's hash is written to /captchaTokens/{hash}
      with `create`, so presenting the same solved captcha twice fails on the
      second attempt. Without this, one solve funds unlimited claims — which is
      the actual exploit on most faucets, not captcha solving itself.

   3. FAIL CLOSED. A provider outage refuses the claim rather than waving it
      through. An uncredited claim is a retry; a free claim is a drained faucet.

   The token record carries a TTL field so a Firestore TTL policy on
   `expiresAt` reclaims the collection automatically — see the deploy guide.
   ========================================================================== */

const SECRET = (process.env.CAPTCHA_SECRET_KEY ?? '').trim();
const VERIFY_URL_OVERRIDE = (process.env.CAPTCHA_VERIFY_URL ?? '').trim();
/** Solved tokens stay valid for this long, matching every provider's own TTL. */
const TOKEN_TTL_MS = 10 * 60 * 1000;

export interface CaptchaCheck {
  ok: boolean;
  provider: string;
  reason?: string;
}

const hash = (value: string): string => createHash('sha256').update(value).digest('hex');

/**
 * Verify a captcha token for an action.
 *
 * `action` scopes the single-use record: the same solve cannot be spent on both
 * a faucet claim and a shortlink claim.
 */
export async function verifyCaptcha(
  token: string | null | undefined,
  action: string,
  ip: string | null,
): Promise<CaptchaCheck> {
  if (!captchaEnabled) return { ok: true, provider: 'none' };

  if (!SECRET) {
    /* A provider is configured for the browser but the server has no secret, so
       nothing can be verified. Refusing is the only safe answer, and the message
       names the missing variable so it is a five-second fix. */
    throw new AppError(
      'Captcha is enabled but CAPTCHA_SECRET_KEY is not set on the server.',
      500,
      'captcha_misconfigured',
    );
  }

  if (!token || token.length < 8) {
    return { ok: false, provider: captchaProvider, reason: 'Complete the captcha first.' };
  }

  const spec = CAPTCHA_PROVIDERS[captchaProvider];
  const url = VERIFY_URL_OVERRIDE || spec.verifyUrl;

  let verified = false;
  let providerReason: string | undefined;

  try {
    const payload: Record<string, string> = {
      [spec.secretField]: SECRET,
      [spec.responseField]: token,
      ...(ip ? { remoteip: ip } : {}),
    };

    const response = await fetch(url, {
      method: 'POST',
      headers:
        spec.verifyEncoding === 'json'
          ? { 'Content-Type': 'application/json' }
          : { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:
        spec.verifyEncoding === 'json'
          ? JSON.stringify(payload)
          : new URLSearchParams(payload).toString(),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      providerReason = `Captcha provider returned ${response.status}.`;
    } else {
      const body = (await response.json()) as Record<string, unknown>;
      /* Providers disagree on the success field. Accept every shape any of the
         four use, rather than special-casing per provider. */
      verified =
        body.success === true ||
        body.status === 'ok' ||
        body.status === 'success' ||
        body.valid === true ||
        body.result === 'valid';

      if (!verified) {
        const codes = Array.isArray(body['error-codes']) ? body['error-codes'].join(', ') : null;
        providerReason = codes ? `Captcha rejected (${codes}).` : 'Captcha rejected. Try again.';
      }
    }
  } catch (error) {
    console.error('[captcha] verification request failed', error);
    providerReason = 'Captcha service unreachable. Try again in a moment.';
  }

  if (!verified) {
    return { ok: false, provider: captchaProvider, reason: providerReason ?? 'Captcha failed.' };
  }

  /* ---- Single-use enforcement --------------------------------------------
     One solve funds exactly one action. The token's hash is the primary key, so
     a replay loses the insert race instead of being trusted. */
  const id = hash(`${action}:${token}`).slice(0, 60);

  if (isSupabaseBackend) {
    try {
      const { supabaseSpendCaptchaToken } = await import('./data-supabase');
      const fresh = await supabaseSpendCaptchaToken(id, new Date(Date.now() + TOKEN_TTL_MS));
      if (!fresh) {
        return {
          ok: false,
          provider: captchaProvider,
          reason: 'That captcha was already used. Solve a new one.',
        };
      }
    } catch (error) {
      /* A failure to RECORD the token must not silently accept it: that would
         turn one solve into unlimited claims, which is the whole attack this
         guard exists to stop. */
      console.error('[captcha] single-use record failed', error);
      return {
        ok: false,
        provider: captchaProvider,
        reason: 'Could not verify that captcha was unused. Try again.',
      };
    }
  } else if (isServerFirebaseReady()) {
    try {
      await db().doc(`captchaTokens/${id}`).create({
        action,
        ip,
        provider: captchaProvider,
        createdAt: now(),
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      });
    } catch {
      return {
        ok: false,
        provider: captchaProvider,
        reason: 'That captcha was already used. Solve a new one.',
      };
    }
  }

  return { ok: true, provider: captchaProvider };
}

/** Throwing wrapper, for route handlers that have nothing to do on failure. */
export async function assertCaptcha(
  token: string | null | undefined,
  action: string,
  ip: string | null,
): Promise<void> {
  const result = await verifyCaptcha(token, action, ip);
  if (!result.ok) throw new AppError(result.reason ?? 'Captcha failed.', 400, 'captcha_failed');
}
