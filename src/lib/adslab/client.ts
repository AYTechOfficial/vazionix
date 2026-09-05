'use client';

/* ============================================================================
   ADSLAB SDK — CLIENT TRIGGERS
   ----------------------------------------------------------------------------
   AdsLab's docs describe TWO trigger APIs and do not say which ships:

       window.adslabShowInterstitial() / adslabShowRewarded()
       window.showint_adslab()        / showrew_adslab()

   Both are feature-detected. Picking one would work until they changed it.

   ══ THE RULE THAT MATTERS ═════════════════════════════════════════════════
   A RESOLVED PROMISE IS NOT PROOF OF COMPLETION, AND MUST NEVER CREDIT.
   Everything in this file runs in the browser, on code the user controls: they
   can call these functions from devtools, or stub them to resolve instantly. The
   balance moves only when AdsLab's server posts back to /api/adslab/postback with
   a valid signature. These helpers exist to SHOW an ad and to tell the UI to
   start waiting — nothing else.
   ══════════════════════════════════════════════════════════════════════════
   ========================================================================== */

declare global {
  interface Window {
    adslabShowInterstitial?: () => Promise<unknown>;
    adslabShowRewarded?: () => Promise<unknown>;
    showint_adslab?: () => Promise<unknown>;
    showrew_adslab?: () => Promise<unknown>;
    ADSLAB_USER?: string;
    ADSLAB_INT?: string;
    ADSLAB_REW?: string;
    ADSLAB_TASK?: string;
  }
}

function interstitialFn() {
  if (typeof window === 'undefined') return null;
  return window.adslabShowInterstitial ?? window.showint_adslab ?? null;
}

function rewardedFn() {
  if (typeof window === 'undefined') return null;
  return window.adslabShowRewarded ?? window.showrew_adslab ?? null;
}

/** True once the SDK has attached at least one trigger. */
export function adslabReady(): boolean {
  return Boolean(interstitialFn() ?? rewardedFn());
}

/* ---- INTERSTITIAL RATE LIMIT ----------------------------------------------
   AdsLab flags publishers who fire interstitials on every interaction. One per
   60s per tab is a defensible floor; the server-side cap that actually protects
   the account is the per-placement cooldown AdsLab itself applies. */
const INTERSTITIAL_GAP_MS = 60_000;
const LAST_KEY = 'vz-adslab-int-last';

function tooSoon(): boolean {
  try {
    const last = Number(sessionStorage.getItem(LAST_KEY) ?? 0);
    return Number.isFinite(last) && Date.now() - last < INTERSTITIAL_GAP_MS;
  } catch {
    return false; // storage blocked: do not let it stop the ad
  }
}

function stamp(): void {
  try {
    sessionStorage.setItem(LAST_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

/**
 * Show an interstitial. Returns false when there is no SDK, no ad, or the rate
 * limit applies — and false must NEVER block the user's action. An ad failing to
 * load is our problem, not theirs.
 */
export async function showInterstitial(): Promise<boolean> {
  const fn = interstitialFn();
  if (!fn || tooSoon()) return false;
  try {
    stamp();
    await fn();
    return true;
  } catch {
    return false;
  }
}

/**
 * Show a rewarded ad. Resolving means the ad was DISPLAYED, not that a reward is
 * owed — see the header. Callers should show "reward pending" and let the
 * postback move the balance.
 */
export async function showRewarded(): Promise<boolean> {
  const fn = rewardedFn();
  if (!fn) return false;
  try {
    await fn();
    return true;
  } catch {
    return false;
  }
}