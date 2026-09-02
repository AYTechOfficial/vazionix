import type { AdFormatId } from './formats';
import type { PlacementId } from './placements';

/* ============================================================================
   AD NETWORK CONFIGURATION
   ----------------------------------------------------------------------------
   Binds a placement id to an actual network tag. NO CREATIVE IS SHIPPED IN THIS
   REPO — every slot is empty until you configure it, and an unconfigured slot
   renders a labelled placeholder at the exact final dimensions.

   THREE WAYS TO FILL A SLOT, in order of preference:

   1. FIRESTORE  (/adUnits/{placementId}) — the live path. Edit in
      Admin → Ads → Inventory, no deploy. A slot flips from placeholder to live
      the moment the document appears. This is what you will use day to day.

   2. ENVIRONMENT  (NEXT_PUBLIC_AD_<PLACEMENT>) — for units you want frozen
      into a build, or to fill slots before the admin console has data. The
      placement id upper-snake-cased: `faucet.belowClaim` becomes
      NEXT_PUBLIC_AD_FAUCET_BELOWCLAIM.

   3. THIS FILE  (`STATIC_UNITS`) — a committed fallback. Useful for the couple
      of units you never intend to change.

   Firestore wins over env, env wins over static.

   ----------------------------------------------------------------------------
   WHAT A TAG LOOKS LIKE
   ----------------------------------------------------------------------------
   ADSTERRA (banner / native): they give you a two-part snippet — an options
   object and a loader script. Paste it whole into `html`:

     <script type="text/javascript">
       atOptions = { key:'REPLACE', format:'iframe', height:90, width:728, params:{} };
     </script>
     <script src="//www.highperformanceformat.com/REPLACE/invoke.js"></script>

   ADSTERRA (social bar / popunder / in-page push): a single loader with no
   container. Set `kind: 'script'` and give only `src`:

     src: '//pl12345678.profitablecpmgate.com/aa/bb/cc/aabbcc.js'

   ADSLAB: same two shapes — either an invoke script with a zone id, or a
   container div plus a loader. Both are supported; use `html` for the former
   and `containerId` + `src` for the latter.

   GOOGLE AD MANAGER / ADSENSE: use `kind: 'html'` with the <ins> block, or
   point `src` at the async loader and set `containerId`.

   ----------------------------------------------------------------------------
   WHY RAW HTML IS ACCEPTED HERE AND ONLY HERE
   ----------------------------------------------------------------------------
   Every ad network on earth ships `document.write`-era markup, so an ad system
   that refuses raw HTML cannot serve ads. The snippet is injected inside a
   sandboxed iframe (see AdUnit.tsx) rather than into the page document, which
   is what keeps a third-party script from reading the session cookie or
   walking the DOM. The trade-off is deliberate and the sandbox is the control.

   Consequently: ONLY an admin may write /adUnits/{id} (enforced in
   firestore.rules), because that document is executable content.
   ========================================================================== */

export type AdUnitKind =
  /** Raw snippet injected into a sandboxed iframe. The common case. */
  | 'html'
  /** A single external script, no container div. Social bar, popunder, push. */
  | 'script'
  /** A container div the loader script fills. AdSense, some AdsLab zones. */
  | 'container'
  /** A destination URL. Direct link / smartlink only. */
  | 'url';

export interface AdUnitConfig {
  /** Which placement this fills. */
  placement: PlacementId;
  kind: AdUnitKind;
  /** Format override. Defaults to the placement's own format. */
  format?: AdFormatId;
  /** `kind: 'html'` — the network's full snippet, pasted verbatim. */
  html?: string;
  /** `kind: 'script' | 'container'` — the loader URL. */
  src?: string;
  /** `kind: 'container'` — the div id the loader targets. */
  containerId?: string;
  /** `kind: 'url'` — the smartlink destination. */
  url?: string;
  /** Which network, for reporting. Free-form: 'Adsterra', 'AdsLab', … */
  network?: string;
  /** Set false to blank the slot without deleting its configuration. */
  enabled: boolean;
  /** Max impressions per session. 0 or absent means unlimited. */
  capPerSession?: number;
  /** Only serve to visitors in these ISO-3166 alpha-2 countries. Empty = all. */
  geo?: string[];
}

/* ---- STATIC FALLBACK -------------------------------------------------------
   Intentionally empty. Add entries only for units you want baked into the
   build; everything else belongs in Firestore so it can change without a
   deploy. Left as an empty record rather than deleted so the merge order in
   `resolveAdUnit` stays three-deep and obvious.                            */
export const STATIC_UNITS: Partial<Record<PlacementId, AdUnitConfig>> = {};

/* ---- ENVIRONMENT ----------------------------------------------------------- */

/** `faucet.belowClaim` → `NEXT_PUBLIC_AD_FAUCET_BELOWCLAIM` */
export const envKeyFor = (placement: PlacementId): string =>
  `NEXT_PUBLIC_AD_${placement.replace(/\./g, '_').replace(/-/g, '_').toUpperCase()}`;

/**
 * Env values are read from a static map rather than `process.env[key]` because
 * Next inlines NEXT_PUBLIC_* at build time by *literal* lookup — a computed
 * index returns undefined in the browser bundle. Only the handful of units
 * most likely to be build-frozen are wired; everything else uses Firestore.
 */
const ENV_UNITS: Partial<Record<PlacementId, string | undefined>> = {
  'global.socialBar': process.env.NEXT_PUBLIC_AD_GLOBAL_SOCIALBAR,
  'global.popunder': process.env.NEXT_PUBLIC_AD_GLOBAL_POPUNDER,
  'global.inPagePush': process.env.NEXT_PUBLIC_AD_GLOBAL_INPAGEPUSH,
  'global.interstitial': process.env.NEXT_PUBLIC_AD_GLOBAL_INTERSTITIAL,
  'global.anchor': process.env.NEXT_PUBLIC_AD_GLOBAL_ANCHOR,
  'shortlink.directLink': process.env.NEXT_PUBLIC_AD_SHORTLINK_DIRECTLINK,
};

/**
 * Parse an env-configured unit. Two accepted forms:
 *   • a bare URL              → treated as `kind: 'script'` (or 'url' for links)
 *   • a JSON AdUnitConfig     → used as-is
 */
function unitFromEnv(placement: PlacementId): AdUnitConfig | null {
  const raw = ENV_UNITS[placement];
  if (!raw) return null;

  const value = raw.trim();
  if (value.startsWith('{')) {
    try {
      const parsed = JSON.parse(value) as Partial<AdUnitConfig>;
      return { placement, kind: 'html', enabled: true, ...parsed };
    } catch {
      // A malformed env var must not take a page down. Fall through to the
      // placeholder, which is visible and therefore self-reporting.
      return null;
    }
  }

  const isLink = placement === 'shortlink.directLink';
  return {
    placement,
    kind: isLink ? 'url' : 'script',
    ...(isLink ? { url: value } : { src: value }),
    enabled: true,
  };
}

/* ---- RESOLUTION ------------------------------------------------------------ */

/**
 * Merge the three sources. `remote` is the Firestore document, passed in by the
 * caller so this module stays free of Firebase imports and can run in a Server
 * Component, a Client Component and a seed script alike.
 */
export function resolveAdUnit(
  placement: PlacementId,
  remote?: AdUnitConfig | null,
): AdUnitConfig | null {
  const candidate = remote ?? unitFromEnv(placement) ?? STATIC_UNITS[placement] ?? null;
  if (!candidate || !candidate.enabled) return null;

  /* A unit with no payload is a half-finished admin edit. Treat it as unfilled
     so the placeholder shows the dimensions rather than rendering an empty
     iframe that looks like a broken ad. */
  const hasPayload =
    (candidate.kind === 'html' && candidate.html) ||
    (candidate.kind === 'script' && candidate.src) ||
    (candidate.kind === 'container' && candidate.src) ||
    (candidate.kind === 'url' && candidate.url);

  return hasPayload ? candidate : null;
}

/* ---- GLOBAL BEHAVIOUR ------------------------------------------------------ */

export interface AdBehaviourConfig {
  /** Master switch. False blanks every slot in the product. */
  enabled: boolean;
  /** Hide all advertising for these uids (staff, QA). */
  exemptUids: string[];
  /** Routes where overlay formats never fire, whatever their config says. */
  overlayBlockedRoutes: string[];
  /** Interstitial: minimum navigations between two showings. */
  interstitialEveryNNavigations: number;
  /** Popunder: max per session. */
  popunderPerSession: number;
  /** Render dimension-labelled placeholders for unfilled slots. */
  showPlaceholders: boolean;
}

export const DEFAULT_AD_BEHAVIOUR: AdBehaviourConfig = {
  enabled: true,
  exemptUids: [],
  /* The withdraw route is excluded from every overlay format. A popunder
     firing mid-payout is the one ad interaction that costs more than it
     earns. */
  overlayBlockedRoutes: ['/withdraw', '/login', '/register', '/admin'],
  interstitialEveryNNavigations: 5,
  popunderPerSession: 1,
  showPlaceholders: process.env.NODE_ENV !== 'production',
};
