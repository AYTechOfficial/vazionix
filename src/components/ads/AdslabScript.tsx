'use client';

import Script from 'next/script';

import { ADSLAB_PLACEMENTS, ADSLAB_SDK_URL, adslabConfigured } from '@/lib/adslab/config';

/* ============================================================================
   ADSLAB SDK LOADER
   ----------------------------------------------------------------------------
   Mounted once, in the authenticated layout, and only for a signed-in user.

   WHY THE CONFIG IS A RAW <script> AND NOT next/script beforeInteractive
   `strategy="beforeInteractive"` is only honoured in the ROOT layout. This
   component lives in the (app) layout — it has to, because the config needs the
   signed-in user's id — so `beforeInteractive` was silently DROPPED: sdk.js
   loaded, but window.ADSLAB_USER / ADSLAB_INT / ADSLAB_REW were all undefined,
   which means every impression was unattributed. Verified in the browser against
   production, which is the only way that failure is visible.

   A plain inline <script> always executes in document order, so it is guaranteed
   to run before the afterInteractive SDK tag below it. That ordering is
   load-bearing: the SDK reads these globals when it initialises.

   NEVER MOUNT THIS FOR AN ANONYMOUS VISITOR. ADSLAB_USER would be empty, the
   conversion could not be attributed to anyone, and the impression is spent for
   nothing.

   Only placement IDs are exposed. They are public by design; the API key and
   secret are server-only and cannot be imported from a Client Component.
   ========================================================================== */

export function AdslabScript({ userId }: { userId: string | null | undefined }) {
  if (!userId || !adslabConfigured) return null;

  /* JSON.stringify, not raw interpolation: a value containing a quote or a
     </script> would otherwise break out of the string. */
  const config =
    `window.ADSLAB_INT=${JSON.stringify(ADSLAB_PLACEMENTS.interstitial)};` +
    `window.ADSLAB_REW=${JSON.stringify(ADSLAB_PLACEMENTS.rewarded)};` +
    `window.ADSLAB_TASK=${JSON.stringify(ADSLAB_PLACEMENTS.task)};` +
    `window.ADSLAB_USER=${JSON.stringify(userId)};`;

  return (
    <>
      <script id="adslab-config" dangerouslySetInnerHTML={{ __html: config }} />
      <Script id="adslab-sdk" src={ADSLAB_SDK_URL} strategy="afterInteractive" />
    </>
  );
}