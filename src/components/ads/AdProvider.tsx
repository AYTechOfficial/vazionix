'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';

import {
  DEFAULT_AD_BEHAVIOUR,
  resolveAdUnit,
  type AdBehaviourConfig,
  type AdUnitConfig,
} from '@/lib/ads/config';
import { AD_FORMATS } from '@/lib/ads/formats';
import { PLACEMENTS, type PlacementId } from '@/lib/ads/placements';

/* ============================================================================
   AD PROVIDER
   ----------------------------------------------------------------------------
   Owns three things no individual slot can own:

   1. THE UNIT MAP. One Firestore read of /adUnits at mount, cached for the tab.
      Without this, a page with nine slots issues nine reads on every
      navigation — at this product's traffic that is the largest single line on
      the Firestore bill.

   2. FREQUENCY STATE. Impression counts and popunder/interstitial fire history
      live here, in module scope, so they survive client-side navigation for the
      life of the tab. Per-slot state would reset on every route change, which
      is how a popunder ends up firing on every page.

   3. OVERLAY MOUNTING. Social bar, popunder, in-page push and interstitial
      occupy no document flow, so they cannot be rendered by a slot inside a
      page. They mount once, here, and are suppressed entirely on the routes in
      `overlayBlockedRoutes` — which always includes /withdraw.

   THE SANDBOX EXCEPTION, STATED PLAINLY
   Overlay formats load into the page document, not into a sandboxed iframe,
   because positioning themselves against the top document is their entire
   function — inside an iframe a social bar renders a 0×0 nothing. That means
   an overlay script CAN see the page DOM. Mitigations: they are admin-only to
   configure, they never load on /withdraw or /admin, and the session cookie is
   httpOnly so a script cannot read it even with full DOM access. If you are not
   comfortable with that trade-off, leave the four overlay placements unfilled
   and the risk does not exist — the rest of the ad system is unaffected.
   ========================================================================== */

interface AdContextValue {
  /** Resolved config for a placement, or null when unfilled. */
  unitFor: (placement: PlacementId) => AdUnitConfig | null;
  behaviour: AdBehaviourConfig;
  /** True when advertising is hidden for this viewer (staff / QA). */
  isExempt: boolean;
  noteImpression: (placement: PlacementId) => void;
  isCapped: (placement: PlacementId, cap?: number) => boolean;
  /** Total filled units, for the admin badge. */
  filledCount: number;
}

const AdContext = React.createContext<AdContextValue | null>(null);

/* Module scope, deliberately: "session" means "this tab until reload". */
const impressionCounts = new Map<string, number>();
const overlayFired = new Set<string>();
let navigationCount = 0;

export interface AdProviderProps {
  children: React.ReactNode;
  /** Server-fetched unit map. Keyed by placement id. */
  units?: Record<string, AdUnitConfig>;
  behaviour?: Partial<AdBehaviourConfig>;
  /** Current viewer, to apply the exemption list. */
  uid?: string | null;
}

export function AdProvider({ children, units = {}, behaviour: behaviourOverride, uid }: AdProviderProps) {
  const pathname = usePathname();

  const behaviour = React.useMemo<AdBehaviourConfig>(
    () => ({ ...DEFAULT_AD_BEHAVIOUR, ...behaviourOverride }),
    [behaviourOverride],
  );

  const isExempt = Boolean(uid && behaviour.exemptUids.includes(uid));

  const unitFor = React.useCallback(
    (placement: PlacementId) => resolveAdUnit(placement, units[placement] ?? null),
    [units],
  );

  const noteImpression = React.useCallback((placement: PlacementId) => {
    impressionCounts.set(placement, (impressionCounts.get(placement) ?? 0) + 1);
  }, []);

  const isCapped = React.useCallback((placement: PlacementId, cap?: number) => {
    if (!cap || cap <= 0) return false;
    return (impressionCounts.get(placement) ?? 0) >= cap;
  }, []);

  const filledCount = React.useMemo(
    () => PLACEMENTS.filter((item) => Boolean(resolveAdUnit(item.id, units[item.id] ?? null))).length,
    [units],
  );

  /* Navigation counter drives interstitial pacing. */
  React.useEffect(() => {
    navigationCount += 1;
  }, [pathname]);

  const overlaysAllowed =
    behaviour.enabled &&
    !isExempt &&
    !behaviour.overlayBlockedRoutes.some((route) => pathname?.startsWith(route));

  const value = React.useMemo<AdContextValue>(
    () => ({ unitFor, behaviour, isExempt, noteImpression, isCapped, filledCount }),
    [unitFor, behaviour, isExempt, noteImpression, isCapped, filledCount],
  );

  return (
    <AdContext.Provider value={value}>
      {children}
      {overlaysAllowed ? <Overlays /> : null}
      {overlaysAllowed ? <AnchorUnit /> : null}
    </AdContext.Provider>
  );
}

export function useAds(): AdContextValue {
  const ctx = React.useContext(AdContext);
  if (!ctx) {
    /* A slot rendered outside the provider must not crash the page. It degrades
       to "no ads configured", which is the same as an unfilled slot. */
    return {
      unitFor: () => null,
      behaviour: DEFAULT_AD_BEHAVIOUR,
      isExempt: false,
      noteImpression: () => {},
      isCapped: () => false,
      filledCount: 0,
    };
  }
  return ctx;
}

/* ---- OVERLAY LOADER --------------------------------------------------------
   Each overlay script is appended to <body> exactly once per tab. The `fired`
   set is module-scoped so a remount (fast refresh, route change) does not load
   the same script twice — which for a popunder means two background tabs and a
   policy violation with most networks.                                     */
function loadOverlayScript(placement: PlacementId, src: string): void {
  if (overlayFired.has(placement)) return;
  overlayFired.add(placement);

  const script = document.createElement('script');
  script.src = src;
  script.async = true;
  script.dataset.adPlacement = placement;
  document.body.appendChild(script);
}

function Overlays() {
  const { unitFor, behaviour } = useAds();
  const pathname = usePathname();

  /* Social bar + in-page push: load on first allowed route, then persist. */
  React.useEffect(() => {
    for (const placement of ['global.socialBar', 'global.inPagePush'] as PlacementId[]) {
      const unit = unitFor(placement);
      if (unit?.src) loadOverlayScript(placement, unit.src);
    }
  }, [unitFor]);

  /* Popunder: capped per session, and only after a real user gesture — every
     network requires the click, and browsers block it without one. */
  React.useEffect(() => {
    const unit = unitFor('global.popunder');
    if (!unit?.src) return;
    if ((impressionCounts.get('global.popunder') ?? 0) >= behaviour.popunderPerSession) return;

    const onFirstClick = () => {
      impressionCounts.set('global.popunder', (impressionCounts.get('global.popunder') ?? 0) + 1);
      loadOverlayScript('global.popunder', unit.src!);
      window.removeEventListener('click', onFirstClick);
    };

    window.addEventListener('click', onFirstClick, { once: true });
    return () => window.removeEventListener('click', onFirstClick);
  }, [unitFor, behaviour.popunderPerSession]);

  /* Interstitial: every Nth navigation, never the first. */
  React.useEffect(() => {
    const unit = unitFor('global.interstitial');
    if (!unit?.src) return;
    if (navigationCount < 2) return;
    if (navigationCount % behaviour.interstitialEveryNNavigations !== 0) return;

    /* Deleted from the fired set first, because unlike the others this one is
       *meant* to load repeatedly — once per qualifying navigation. */
    overlayFired.delete('global.interstitial');
    loadOverlayScript('global.interstitial', unit.src);
  }, [pathname, unitFor, behaviour.interstitialEveryNNavigations]);

  return null;
}

/* ---- ANCHOR ----------------------------------------------------------------
   A fixed bottom bar, rendered as a real sandboxed unit rather than a network
   overlay so we control the dismiss button and the safe-area inset. Sits above
   the mobile tab bar, and dismissal persists for the tab.                  */
function AnchorUnit() {
  const { unitFor } = useAds();
  const [dismissed, setDismissed] = React.useState(false);
  const unit = unitFor('global.anchor');

  if (!unit || dismissed) return null;

  const spec = AD_FORMATS.anchor;
  const html =
    unit.kind === 'html' && unit.html
      ? unit.html
      : unit.src
        ? `<script src="${unit.src}" async></script>`
        : null;
  if (!html) return null;

  const doc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank">
<style>html,body{margin:0;padding:0;overflow:hidden;background:transparent;display:flex;align-items:center;justify-content:center}</style>
</head><body>${html}</body></html>`;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[60] flex justify-center border-t border-line bg-surface-1/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] md:pb-0"
      role="complementary"
      aria-label="Advertisement"
    >
      <div className="relative">
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss advertisement"
          className="absolute -top-6 right-0 z-[2] rounded-t-md border border-line border-b-0 bg-surface-2 px-2 py-0.5 text-11 text-text-3 hover:text-text"
        >
          Close ✕
        </button>
        <iframe
          title="Advertisement — sticky anchor"
          srcDoc={doc}
          sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms"
          scrolling="no"
          className="block border-0 bg-transparent"
          style={{ width: `${spec.width}px`, height: `${spec.height}px`, maxWidth: '100vw' }}
        />
      </div>
    </div>
  );
}
