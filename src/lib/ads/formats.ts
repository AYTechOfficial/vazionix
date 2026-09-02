/* ============================================================================
   AD FORMAT REGISTRY
   ----------------------------------------------------------------------------
   Advertising is the primary revenue surface of this product, so the formats
   are modelled as data — exact pixel dimensions, one entry per unit an ad
   network will actually serve. Nothing in the UI hardcodes an ad size.

   WHY EXACT PIXELS MATTER
   An unfilled slot must reserve the *same box* the filled slot will occupy.
   If it does not, pasting a live tag reflows the page, the Cumulative Layout
   Shift score collapses, and — more expensively — the first impression of
   every session renders into a box that is still resizing, which some
   networks score as a viewability failure and pay less for.

   So every spatial format below carries a fixed width/height, the slot renders
   at that size whether or not a tag is configured, and dropping in an AdsLab
   or Adsterra snippet changes nothing about layout.

   THE FOUR SHAPES
   Formats fall into four families, and the renderer branches on `kind`:
     `fixed`       — a hard w×h box (all IAB display units)
     `fluid`       — responsive; height grows with content (native, in-feed)
     `overlay`     — positioned by the network, occupies no document flow
                     (social bar, popunder, in-page push, vignette)
     `link`        — a bare destination URL, no markup (direct link / smartlink)
   ========================================================================== */

export type AdFormatKind = 'fixed' | 'fluid' | 'overlay' | 'link';

export interface AdFormat {
  id: AdFormatId;
  label: string;
  kind: AdFormatKind;
  /** CSS pixels. Null for fluid/overlay/link formats. */
  width: number | null;
  height: number | null;
  /** Minimum height reserved for a fluid unit before its creative loads. */
  minHeight?: number;
  /** Human note shown in the admin ad manager and in the dev placeholder. */
  note: string;
  /** Networks known to serve this exact unit. Documentation only. */
  networks: string[];
}

export type AdFormatId =
  /* -- IAB display, desktop ------------------------------------------------ */
  | 'leaderboard'        // 728 x 90   — the workhorse above-content unit
  | 'largeLeaderboard'   // 970 x 90
  | 'billboard'          // 970 x 250  — highest CPM display unit that exists
  | 'banner'             // 468 x 60   — legacy, still bid on by faucet networks
  | 'rectangle'          // 300 x 250  — highest fill rate of any unit
  | 'largeRectangle'     // 336 x 280
  | 'halfPage'           // 300 x 600  — best CPM in a sidebar rail
  | 'skyscraper'         // 160 x 600
  | 'square'             // 250 x 250
  | 'smallSquare'        // 200 x 200
  /* -- IAB display, mobile ------------------------------------------------- */
  | 'mobileBanner'       // 320 x 50
  | 'mobileLarge'        // 320 x 100
  | 'mobileRectangle'    // 300 x 250 (same box, mobile placement semantics)
  /* -- Responsive ---------------------------------------------------------- */
  | 'native'             // network-styled native unit
  | 'inFeed'             // native unit sized to sit in a card grid
  | 'video'              // 16:9 VAST / outstream
  /* -- Non-spatial --------------------------------------------------------- */
  | 'anchor'             // sticky bottom bar, 320x50 / 728x90 by viewport
  | 'interstitial'       // full-screen between navigations (vignette)
  | 'socialBar'          // Adsterra Social Bar — network-positioned
  | 'popunder'           // opens a background tab
  | 'inPagePush'         // push-style toast, network-positioned
  | 'directLink';        // smartlink URL, used by the shortlink engine

export const AD_FORMATS: Record<AdFormatId, AdFormat> = {
  /* ---- Desktop display --------------------------------------------------- */
  leaderboard: {
    id: 'leaderboard',
    label: 'Leaderboard',
    kind: 'fixed',
    width: 728,
    height: 90,
    note: 'Above-content banner. Highest impression count of any unit on the site.',
    networks: ['Adsterra', 'AdsLab', 'A-ADS'],
  },
  largeLeaderboard: {
    id: 'largeLeaderboard',
    label: 'Large leaderboard',
    kind: 'fixed',
    width: 970,
    height: 90,
    note: 'Wide-viewport variant of the leaderboard. Falls back to 728x90 below 1024px.',
    networks: ['Adsterra', 'AdsLab'],
  },
  billboard: {
    id: 'billboard',
    label: 'Billboard',
    kind: 'fixed',
    width: 970,
    height: 250,
    note: 'Largest display unit. Reserve for the top of high-traffic pages only.',
    networks: ['Adsterra', 'AdsLab'],
  },
  banner: {
    id: 'banner',
    label: 'Banner',
    kind: 'fixed',
    width: 468,
    height: 60,
    note: 'Legacy unit. Still carries strong fill on crypto/faucet networks.',
    networks: ['Adsterra', 'AdsLab', 'A-ADS'],
  },
  rectangle: {
    id: 'rectangle',
    label: 'Medium rectangle',
    kind: 'fixed',
    width: 300,
    height: 250,
    note: 'Highest fill rate of any format. Safe default when unsure.',
    networks: ['Adsterra', 'AdsLab', 'A-ADS'],
  },
  largeRectangle: {
    id: 'largeRectangle',
    label: 'Large rectangle',
    kind: 'fixed',
    width: 336,
    height: 280,
    note: 'In-content unit. Outperforms 300x250 where the column is wide enough.',
    networks: ['Adsterra', 'AdsLab'],
  },
  halfPage: {
    id: 'halfPage',
    label: 'Half page',
    kind: 'fixed',
    width: 300,
    height: 600,
    note: 'Sidebar rail unit. Longest time-in-view, so the best sidebar CPM.',
    networks: ['Adsterra', 'AdsLab'],
  },
  skyscraper: {
    id: 'skyscraper',
    label: 'Wide skyscraper',
    kind: 'fixed',
    width: 160,
    height: 600,
    note: 'Narrow rail alternative to the half page.',
    networks: ['Adsterra', 'AdsLab'],
  },
  square: {
    id: 'square',
    label: 'Square',
    kind: 'fixed',
    width: 250,
    height: 250,
    note: 'Fits a card grid cell without breaking the column rhythm.',
    networks: ['Adsterra', 'AdsLab'],
  },
  smallSquare: {
    id: 'smallSquare',
    label: 'Small square',
    kind: 'fixed',
    width: 200,
    height: 200,
    note: 'Compact in-grid unit for dense task lists.',
    networks: ['Adsterra', 'AdsLab'],
  },

  /* ---- Mobile display ---------------------------------------------------- */
  mobileBanner: {
    id: 'mobileBanner',
    label: 'Mobile banner',
    kind: 'fixed',
    width: 320,
    height: 50,
    note: 'Mobile equivalent of the leaderboard.',
    networks: ['Adsterra', 'AdsLab'],
  },
  mobileLarge: {
    id: 'mobileLarge',
    label: 'Large mobile banner',
    kind: 'fixed',
    width: 320,
    height: 100,
    note: 'Double-height mobile unit. Roughly 1.6x the CPM of 320x50.',
    networks: ['Adsterra', 'AdsLab'],
  },
  mobileRectangle: {
    id: 'mobileRectangle',
    label: 'Mobile rectangle',
    kind: 'fixed',
    width: 300,
    height: 250,
    note: 'In-content rectangle on mobile viewports.',
    networks: ['Adsterra', 'AdsLab'],
  },

  /* ---- Responsive -------------------------------------------------------- */
  native: {
    id: 'native',
    label: 'Native banner',
    kind: 'fluid',
    width: null,
    height: null,
    minHeight: 250,
    note: 'Network-styled unit that inherits page typography. Renders into a container div.',
    networks: ['Adsterra', 'AdsLab'],
  },
  inFeed: {
    id: 'inFeed',
    label: 'In-feed native',
    kind: 'fluid',
    width: null,
    height: null,
    minHeight: 180,
    note: 'Native unit sized to occupy one cell of a task card grid.',
    networks: ['Adsterra', 'AdsLab'],
  },
  video: {
    id: 'video',
    label: 'Outstream video',
    kind: 'fluid',
    width: null,
    height: null,
    minHeight: 200,
    note: '16:9 video unit driven by a VAST tag. Highest CPM per impression on the site.',
    networks: ['Adsterra', 'AdsLab'],
  },

  /* ---- Non-spatial ------------------------------------------------------- */
  anchor: {
    id: 'anchor',
    label: 'Sticky anchor',
    kind: 'fixed',
    width: 728,
    height: 90,
    note: 'Pinned to the bottom of the viewport. 320x50 below 768px. Dismissible.',
    networks: ['Adsterra', 'AdsLab'],
  },
  interstitial: {
    id: 'interstitial',
    label: 'Interstitial / vignette',
    kind: 'overlay',
    width: null,
    height: null,
    note: 'Full-screen unit shown between navigations. Frequency-capped per session.',
    networks: ['Adsterra', 'AdsLab'],
  },
  socialBar: {
    id: 'socialBar',
    label: 'Social bar',
    kind: 'overlay',
    width: null,
    height: null,
    note: 'Adsterra Social Bar. Network positions it; loads once per page, no container.',
    networks: ['Adsterra'],
  },
  popunder: {
    id: 'popunder',
    label: 'Popunder',
    kind: 'overlay',
    width: null,
    height: null,
    note: 'Opens a background tab on first qualifying interaction. Highest revenue per user.',
    networks: ['Adsterra', 'AdsLab'],
  },
  inPagePush: {
    id: 'inPagePush',
    label: 'In-page push',
    kind: 'overlay',
    width: null,
    height: null,
    note: 'Push-style notification rendered in-page. No browser permission prompt.',
    networks: ['Adsterra', 'AdsLab'],
  },
  directLink: {
    id: 'directLink',
    label: 'Direct link / smartlink',
    kind: 'link',
    width: null,
    height: null,
    note: 'A destination URL, not markup. Powers the shortlink earning engine.',
    networks: ['Adsterra', 'AdsLab'],
  },
};

/** Every format id, in registry order. Used by the admin ad manager. */
export const AD_FORMAT_IDS = Object.keys(AD_FORMATS) as AdFormatId[];

/** Formats that occupy document flow and therefore need a reserved box. */
export const SPATIAL_FORMATS = AD_FORMAT_IDS.filter(
  (id) => AD_FORMATS[id].kind === 'fixed' || AD_FORMATS[id].kind === 'fluid',
);

/** "728 × 90" / "Responsive" — the label under a placeholder box. */
export function formatDimensions(id: AdFormatId): string {
  const f = AD_FORMATS[id];
  if (f.width && f.height) return `${f.width} × ${f.height}`;
  if (f.kind === 'link') return 'URL';
  return 'Responsive';
}
