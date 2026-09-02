/* ============================================================================
   CAPTCHA — provider abstraction
   ----------------------------------------------------------------------------
   The product ships with NO captcha keys and NO bundled provider. You pick one
   with two environment variables and the widget appears on every gated action.

   WHY AN ABSTRACTION RATHER THAN ONE PROVIDER
   AdsLab's captcha is a revenue product: solving it pays the publisher. That
   makes it the right default here, and it also makes it the provider most
   likely to change its embed shape. Every provider below is expressed as the
   same three facts — a script URL, a widget container, and a verification
   endpoint — so switching is an env change, not a code change.

   HOW A GATED ACTION WORKS
     1. `<CaptchaGate>` renders the provider widget and yields a token.
     2. The token is POSTed with the claim.
     3. `src/server/captcha.ts` verifies it against the provider, server-side,
        with the secret key. A token is single-use and is recorded so a replay
        cannot fund two claims.
   Client-side "verification" is decoration. Only step 3 counts.

   ADSLAB SETUP
     NEXT_PUBLIC_CAPTCHA_PROVIDER=adslab
     NEXT_PUBLIC_CAPTCHA_SITE_KEY=<your zone / site key>
     NEXT_PUBLIC_CAPTCHA_SCRIPT_URL=<the loader URL AdsLab gives you>
     CAPTCHA_SECRET_KEY=<your secret>
     CAPTCHA_VERIFY_URL=<their verify endpoint>
   Leave the provider unset and gated actions run without a captcha, which is
   what you want locally and never want in production.
   ========================================================================== */

export type CaptchaProvider = 'none' | 'adslab' | 'hcaptcha' | 'turnstile' | 'recaptcha';

export interface CaptchaProviderSpec {
  id: CaptchaProvider;
  label: string;
  /** Loader script. `{key}` is replaced with the site key. */
  script: string | null;
  /** Class the provider's loader looks for to mount the widget. */
  widgetClass: string;
  /** Global callback name the widget calls with the solved token, if any. */
  tokenField: string;
  /** Server verification endpoint. */
  verifyUrl: string;
  /** Body encoding the verify endpoint expects. */
  verifyEncoding: 'form' | 'json';
  /** Field names in the verification request. */
  secretField: string;
  responseField: string;
  /** Approximate rendered size, so the gate reserves the right box. */
  width: number;
  height: number;
}

export const CAPTCHA_PROVIDERS: Record<CaptchaProvider, CaptchaProviderSpec> = {
  none: {
    id: 'none',
    label: 'Disabled',
    script: null,
    widgetClass: '',
    tokenField: '',
    verifyUrl: '',
    verifyEncoding: 'form',
    secretField: 'secret',
    responseField: 'response',
    width: 0,
    height: 0,
  },
  adslab: {
    id: 'adslab',
    label: 'AdsLab Captcha',
    /* AdsLab hands you a loader URL; it goes in NEXT_PUBLIC_CAPTCHA_SCRIPT_URL
       and overrides this placeholder. Kept non-null so the gate knows the
       provider is script-driven. */
    script: '{scriptUrl}',
    widgetClass: 'adslab-captcha',
    tokenField: 'adslab-captcha-response',
    verifyUrl: 'https://api.adslab.io/captcha/verify',
    verifyEncoding: 'form',
    secretField: 'secret',
    responseField: 'response',
    width: 302,
    height: 78,
  },
  hcaptcha: {
    id: 'hcaptcha',
    label: 'hCaptcha',
    script: 'https://js.hcaptcha.com/1/api.js?render=explicit',
    widgetClass: 'h-captcha',
    tokenField: 'h-captcha-response',
    verifyUrl: 'https://api.hcaptcha.com/siteverify',
    verifyEncoding: 'form',
    secretField: 'secret',
    responseField: 'response',
    width: 303,
    height: 78,
  },
  turnstile: {
    id: 'turnstile',
    label: 'Cloudflare Turnstile',
    script: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
    widgetClass: 'cf-turnstile',
    tokenField: 'cf-turnstile-response',
    verifyUrl: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    verifyEncoding: 'json',
    secretField: 'secret',
    responseField: 'response',
    width: 300,
    height: 65,
  },
  recaptcha: {
    id: 'recaptcha',
    label: 'Google reCAPTCHA v2',
    script: 'https://www.google.com/recaptcha/api.js?render=explicit',
    widgetClass: 'g-recaptcha',
    tokenField: 'g-recaptcha-response',
    verifyUrl: 'https://www.google.com/recaptcha/api/siteverify',
    verifyEncoding: 'form',
    secretField: 'secret',
    responseField: 'response',
    width: 304,
    height: 78,
  },
};

function readProvider(): CaptchaProvider {
  const raw = (process.env.NEXT_PUBLIC_CAPTCHA_PROVIDER ?? '').trim().toLowerCase();
  return raw in CAPTCHA_PROVIDERS ? (raw as CaptchaProvider) : 'none';
}

export const captchaProvider = readProvider();

export const captchaSiteKey = (process.env.NEXT_PUBLIC_CAPTCHA_SITE_KEY ?? '').trim();

/** Overrides the provider's default loader. Required for AdsLab. */
export const captchaScriptOverride = (process.env.NEXT_PUBLIC_CAPTCHA_SCRIPT_URL ?? '').trim();

/**
 * True when a captcha can actually render. A provider set without a site key is
 * a misconfiguration, and gating a claim behind a widget that cannot appear
 * would lock every user out of earning.
 */
export const captchaEnabled = captchaProvider !== 'none' && Boolean(captchaSiteKey);

export function captchaSpec(): CaptchaProviderSpec {
  const spec = CAPTCHA_PROVIDERS[captchaProvider];
  const script = captchaScriptOverride || (spec.script === '{scriptUrl}' ? null : spec.script);
  return { ...spec, script: script ? script.replace('{key}', captchaSiteKey) : null };
}
