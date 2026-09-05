/* ============================================================================
   ADSLAB — PUBLIC CONFIG (client-safe)
   ----------------------------------------------------------------------------
   Placement IDs only. These are public by design: they appear in the SDK config
   on every page and identify the ad slot, not the account. The API key and the
   secret/security hash are NOT here and must never be — they live in
   `src/server/adslab.ts`, which is `server-only`.

   Banner unit ids are published by AdsLab per size. They are equally public.
   ========================================================================== */

export const ADSLAB_PLACEMENTS = {
  interstitial: process.env.NEXT_PUBLIC_ADSLAB_INT ?? '',
  rewarded: process.env.NEXT_PUBLIC_ADSLAB_REW ?? '',
  task: process.env.NEXT_PUBLIC_ADSLAB_TASK ?? '',
} as const;

/** True when the SDK has the ids it needs. Without them the loader would read
    undefined placements and every impression would be unattributed. */
export const adslabConfigured = Boolean(
  ADSLAB_PLACEMENTS.interstitial || ADSLAB_PLACEMENTS.rewarded || ADSLAB_PLACEMENTS.task,
);

/** AdsLab banner unit ids, keyed by the rendered size. */
export const ADSLAB_BANNER_UNITS = {
  '300x250': 'unit-go1fidksi',
  '300x600': 'unit-4xxc94u58',
  '160x600': 'unit-xg5uzzqbx',
  '336x280': 'unit-ii5t4os4x',
  '320x100': 'unit-n2cnjps79',
  '320x50': 'unit-52ou5j53t',
  '468x60': 'unit-38tbyqp5y',
  '728x90': 'unit-r4zdvttw8',
} as const;

export type AdslabBannerSize = keyof typeof ADSLAB_BANNER_UNITS;

export const ADSLAB_SDK_URL = 'https://adslab.me/api/sdk.js';
export const ADSLAB_BANNER_JS = 'https://serve.adslab.me/api/banner/js';

/** Task categories the proxy will accept. Anything else is refused rather than
    forwarded, so a caller cannot use us as an open proxy to adslab.me. */
export const ADSLAB_TASK_TYPES = [
  'all',
  'telegram',
  'ptc',
  'shortlinks',
  'surveys',
  'offers',
  'reviews',
] as const;

export type AdslabTaskType = (typeof ADSLAB_TASK_TYPES)[number];