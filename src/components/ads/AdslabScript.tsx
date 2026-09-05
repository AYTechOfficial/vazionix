'use client';

import Script from 'next/script';

import { ADSLAB_PLACEMENTS, ADSLAB_SDK_URL, adslabConfigured } from '@/lib/adslab/config';

/* ============================================================================
   ADSLAB SDK LOADER
   ----------------------------------------------------------------------------
   Mounted once, in the authenticated layout, and only for a signed-in user.

   GETTING THE CONFIG GLOBALS SET IS HARDER THAN IT LOOKS — TWO FAILED ATTEMPTS
   1. `next/script strategy="beforeInteractive"` is only honoured in the ROOT
      layout. This component has to live in the (app) layout because it needs the
      signed-in user's id, so the config was silently dropped.
   2. A raw <script dangerouslySetInnerHTML> works on a full page load, but React
      does not execute a <script> it inserts during CLIENT navigation. Signing in
      goes login -> dashboard through the router, so the globals stayed undefined
      on exactly the path every real user takes.

   Both were invisible to the build and to typecheck; only reading `window.*` on
   the deployed page showed it.

   WHAT ACTUALLY WORKS: assign the globals during render, which on the client runs
   before `next/script` injects the SDK, and on the server is a no-op. The inline
   script is kept as well so the values are present in the SSR HTML for a
   first-paint load. Belt and braces, because an unattributed impression is
   revenue that silently disappears.

   NEVER MOUNT THIS FOR AN ANONYMOUS VISITOR: ADSLAB_USER would be empty and the
   conversion could not be attributed to anyone.

   Only placement IDs are exposed here. They are public by design; the API key and
   secret are server-only and cannot be imported from a Client Component.
   ========================================================================== */

export function AdslabScript({ userId }: { userId: string | null | undefined }) {
  if (!userId || !adslabConfigured) return null;

  /* Assigning during render is deliberate: it is the only hook that reliably runs
     BEFORE next/script appends sdk.js, on both hydration and client navigation.
     The SDK reads these when it initialises, so late is the same as never. */
  if (typeof window !== 'undefined') {
    window.ADSLAB_INT = ADSLAB_PLACEMENTS.interstitial;
    window.ADSLAB_REW = ADSLAB_PLACEMENTS.rewarded;
    window.ADSLAB_TASK = ADSLAB_PLACEMENTS.task;
    window.ADSLAB_USER = userId;
  }

  /* JSON.stringify, not raw interpolation: a value containing a quote or a
     closing script tag would otherwise break out of the string. */
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