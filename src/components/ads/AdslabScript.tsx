'use client';

import Script from 'next/script';

import { ADSLAB_PLACEMENTS, ADSLAB_SDK_URL, adslabConfigured } from '@/lib/adslab/config';

/* ============================================================================
   ADSLAB SDK LOADER
   ----------------------------------------------------------------------------
   Mounted once, in the authenticated layout, and only for a signed-in user.

   ORDER IS LOAD-BEARING. The config script must execute BEFORE sdk.js, or the
   SDK reads undefined placement ids and every impression is unattributed. That
   is why the config uses `beforeInteractive` and the SDK `afterInteractive`.

   NEVER MOUNT THIS FOR AN ANONYMOUS VISITOR. `ADSLAB_USER` would be empty, the
   conversion could not be attributed to anyone, and the impression would be spent
   for nothing.

   Only placement IDs are exposed here. They are public by design; the API key and
   secret are server-only and are not importable from a Client Component.
   ========================================================================== */

export function AdslabScript({ userId }: { userId: string | null | undefined }) {
  if (!userId || !adslabConfigured) return null;

  /* JSON.stringify rather than raw interpolation: a value containing a quote
     would otherwise break out of the string and into the script. */
  const config = [
    `window.ADSLAB_INT=${JSON.stringify(ADSLAB_PLACEMENTS.interstitial)};`,
    `window.ADSLAB_REW=${JSON.stringify(ADSLAB_PLACEMENTS.rewarded)};`,
    `window.ADSLAB_TASK=${JSON.stringify(ADSLAB_PLACEMENTS.task)};`,
    `window.ADSLAB_USER=${JSON.stringify(userId)};`,
  ].join('');

  return (
    <>
      <Script id="adslab-config" strategy="beforeInteractive">
        {config}
      </Script>
      <Script id="adslab-sdk" src={ADSLAB_SDK_URL} strategy="afterInteractive" />
    </>
  );
}