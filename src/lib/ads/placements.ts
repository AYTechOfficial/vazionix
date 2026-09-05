import { AD_FORMATS, type AdFormatId } from './formats';

/* ============================================================================
   AD PLACEMENT MAP
   ----------------------------------------------------------------------------
   One entry per physical ad position in the product. A placement is a STABLE
   ID — `faucet.afterClaim` — that never changes, so a zone key pasted into the
   admin ad manager keeps pointing at the same box across redesigns.

   Placements carry a desktop format and a mobile format. The renderer picks
   between them with a CSS media query rather than JavaScript, so there is no
   layout shift on first paint and no hydration mismatch.

   DENSITY
   Ads are this product's primary revenue, so the map is deliberately dense —
   the highest-traffic pages (faucet, PTC, shortlinks, offerwall) carry seven
   to nine units each, across every format a network will bid on. Every one of
   them ships empty; you fill the ones you want from Admin → Ads → Inventory.

   THE ONE PLACEMENT RULE THAT SURVIVES
   Nothing renders BETWEEN a withdrawal amount field and its payout selector.
   Withdraw still carries units — above the page header, in the right rail, and
   below the completed transaction card — but never interleaved with the
   controls that move a user's money. A misclick there is a support ticket and
   a chargeback, which costs more than the impression earns. Every other
   surface in the product is monetised.
   ========================================================================== */

export type PlacementId =
  /* -- Public / landing ---------------------------------------------------- */
  | 'landing.top'
  | 'landing.heroBelow'
  | 'landing.midContent'
  | 'landing.native'
  | 'landing.beforeFooter'
  /* -- Auth ---------------------------------------------------------------- */
  | 'auth.belowForm'
  /* -- Dashboard ----------------------------------------------------------- */
  | 'dashboard.top'
  | 'dashboard.underHero'
  | 'dashboard.inFeed'
  | 'dashboard.midContent'
  | 'dashboard.railTop'
  | 'dashboard.railBottom'
  | 'dashboard.native'
  | 'dashboard.video'
  | 'dashboard.bottom'
  /* -- Faucet (highest traffic page in the product) ------------------------ */
  | 'faucet.top'
  | 'faucet.aboveClaim'
  | 'faucet.belowClaim'
  | 'faucet.afterClaim'
  | 'faucet.railTop'
  | 'faucet.railBottom'
  | 'faucet.native'
  | 'faucet.video'
  | 'faucet.bottom'
  /* -- PTC ----------------------------------------------------------------- */
  | 'ptc.top'
  | 'ptc.inGrid'
  | 'ptc.beforeView'
  | 'ptc.afterView'
  | 'ptc.rail'
  | 'ptc.native'
  | 'ptc.bottom'
  /* -- Shortlinks ---------------------------------------------------------- */
  | 'shortlinks.top'
  | 'shortlinks.inGrid'
  | 'shortlinks.beforeRedirect'
  | 'shortlinks.rail'
  | 'shortlinks.native'
  | 'shortlinks.bottom'
  /* -- Offerwall ----------------------------------------------------------- */
  | 'offerwall.top'
  | 'offerwall.inGrid'
  | 'offerwall.rail'
  | 'offerwall.native'
  | 'offerwall.bottom'
  /* -- Tasks (the AdsLab task wall) ---------------------------------------- */
  | 'tasks.top'
  | 'tasks.inGrid'
  | 'tasks.rail'
  | 'tasks.native'
  | 'tasks.bottom'
  /* -- Daily bonus / challenges / lottery ---------------------------------- */
  | 'daily.top'
  | 'daily.afterClaim'
  | 'daily.rail'
  | 'daily.bottom'
  | 'challenges.top'
  | 'challenges.inGrid'
  | 'challenges.rail'
  | 'challenges.bottom'
  | 'lottery.top'
  | 'lottery.rail'
  | 'lottery.bottom'
  /* -- Social surfaces ----------------------------------------------------- */
  | 'leaderboard.top'
  | 'leaderboard.midTable'
  | 'leaderboard.rail'
  | 'leaderboard.bottom'
  | 'referrals.top'
  | 'referrals.rail'
  | 'referrals.bottom'
  | 'community.top'
  | 'community.inFeed'
  | 'community.bottom'
  /* -- Account surfaces ---------------------------------------------------- */
  | 'transactions.top'
  | 'transactions.midTable'
  | 'transactions.bottom'
  | 'account.top'
  | 'account.rail'
  | 'account.bottom'
  | 'tickets.top'
  | 'tickets.bottom'
  | 'coupon.top'
  | 'coupon.bottom'
  /* -- Withdraw (restricted; see placement rule above) --------------------- */
  | 'withdraw.top'
  | 'withdraw.rail'
  | 'withdraw.belowCard'
  /* -- Global, non-spatial ------------------------------------------------- */
  | 'global.anchor'
  | 'global.socialBar'
  | 'global.popunder'
  | 'global.inPagePush'
  | 'global.interstitial'
  /* -- Monetised link inventory -------------------------------------------- */
  | 'shortlink.directLink';

export interface Placement {
  id: PlacementId;
  /** Page group, for the admin inventory table. */
  page: string;
  /** Where on the page, in plain words. */
  position: string;
  /** Format rendered at >= 768px. */
  format: AdFormatId;
  /** Format rendered below 768px. Same as `format` when the unit is fluid. */
  mobileFormat: AdFormatId;
  /** Why this unit is here, for whoever fills it. */
  note?: string;
}

const p = (
  id: PlacementId,
  page: string,
  position: string,
  format: AdFormatId,
  mobileFormat: AdFormatId = format,
  note?: string,
): Placement => ({ id, page, position, format, mobileFormat, note });

export const PLACEMENTS: Placement[] = [
  /* ---- Landing ----------------------------------------------------------- */
  p('landing.top', 'Landing', 'Above the hero', 'billboard', 'mobileLarge', 'First impression of every organic visitor.'),
  p('landing.heroBelow', 'Landing', 'Directly under the hero CTA', 'leaderboard', 'mobileBanner'),
  p('landing.midContent', 'Landing', 'Between feature sections', 'largeRectangle', 'mobileRectangle'),
  p('landing.native', 'Landing', 'Inside the "how it works" rail', 'native', 'native'),
  p('landing.beforeFooter', 'Landing', 'Above the footer', 'leaderboard', 'mobileLarge'),

  /* ---- Auth -------------------------------------------------------------- */
  p('auth.belowForm', 'Auth', 'Under the sign-in / sign-up card', 'rectangle', 'mobileRectangle', 'Only unit on the auth pages — the form stays clean.'),

  /* ---- Dashboard --------------------------------------------------------- */
  p('dashboard.top', 'Dashboard', 'Above the page header', 'leaderboard', 'mobileLarge'),
  p('dashboard.underHero', 'Dashboard', 'Under the stat band', 'largeLeaderboard', 'mobileBanner'),
  p('dashboard.inFeed', 'Dashboard', 'Inside the quick-actions grid', 'inFeed', 'inFeed'),
  p('dashboard.midContent', 'Dashboard', 'Between earnings chart and activity', 'largeRectangle', 'mobileRectangle'),
  p('dashboard.railTop', 'Dashboard', 'Top of the right rail', 'halfPage', 'mobileRectangle'),
  p('dashboard.railBottom', 'Dashboard', 'Bottom of the right rail', 'rectangle', 'mobileRectangle'),
  p('dashboard.native', 'Dashboard', 'Inside the offer rail', 'native', 'native'),
  p('dashboard.video', 'Dashboard', 'Below the activity table', 'video', 'video', 'Outstream video — the highest CPM unit available.'),
  p('dashboard.bottom', 'Dashboard', 'Page footer', 'leaderboard', 'mobileLarge'),

  /* ---- Faucet ------------------------------------------------------------ */
  p('faucet.top', 'Faucet', 'Above the page header', 'billboard', 'mobileLarge', 'Faucet is the most-visited page; this is the single best box on the site.'),
  p('faucet.aboveClaim', 'Faucet', 'Above the claim card', 'leaderboard', 'mobileBanner'),
  p('faucet.belowClaim', 'Faucet', 'Directly under the claim button', 'largeRectangle', 'mobileRectangle', 'Viewed for the full length of every cooldown.'),
  p('faucet.afterClaim', 'Faucet', 'Shown in the post-claim success panel', 'rectangle', 'mobileRectangle', 'Renders only after a successful claim — peak attention.'),
  p('faucet.railTop', 'Faucet', 'Top of the right rail', 'halfPage', 'mobileRectangle'),
  p('faucet.railBottom', 'Faucet', 'Bottom of the right rail', 'rectangle', 'mobileRectangle'),
  p('faucet.native', 'Faucet', 'Under the claim history', 'native', 'native'),
  p('faucet.video', 'Faucet', 'Beside the cooldown timer', 'video', 'video'),
  p('faucet.bottom', 'Faucet', 'Page footer', 'leaderboard', 'mobileLarge'),

  /* ---- PTC --------------------------------------------------------------- */
  p('ptc.top', 'PTC', 'Above the page header', 'leaderboard', 'mobileLarge'),
  p('ptc.inGrid', 'PTC', 'Inside the ad grid, cell 4', 'inFeed', 'inFeed'),
  p('ptc.beforeView', 'PTC', 'On the pre-view interstitial panel', 'largeRectangle', 'mobileRectangle'),
  p('ptc.afterView', 'PTC', 'On the reward confirmation panel', 'rectangle', 'mobileRectangle'),
  p('ptc.rail', 'PTC', 'Right rail', 'halfPage', 'mobileRectangle'),
  p('ptc.native', 'PTC', 'Under the grid', 'native', 'native'),
  p('ptc.bottom', 'PTC', 'Page footer', 'leaderboard', 'mobileLarge'),

  /* ---- Shortlinks -------------------------------------------------------- */
  p('shortlinks.top', 'Shortlinks', 'Above the page header', 'leaderboard', 'mobileLarge'),
  p('shortlinks.inGrid', 'Shortlinks', 'Inside the link grid, cell 3', 'inFeed', 'inFeed'),
  p('shortlinks.beforeRedirect', 'Shortlinks', 'On the redirect countdown screen', 'billboard', 'mobileRectangle', 'Held on screen for the full countdown.'),
  p('shortlinks.rail', 'Shortlinks', 'Right rail', 'halfPage', 'mobileRectangle'),
  p('shortlinks.native', 'Shortlinks', 'Under the grid', 'native', 'native'),
  p('shortlinks.bottom', 'Shortlinks', 'Page footer', 'leaderboard', 'mobileLarge'),

  /* ---- Offerwall --------------------------------------------------------- */
  p('offerwall.top', 'Offerwall', 'Above the page header', 'leaderboard', 'mobileLarge'),
  p('offerwall.inGrid', 'Offerwall', 'Inside the provider grid', 'inFeed', 'inFeed'),
  p('offerwall.rail', 'Offerwall', 'Right rail', 'halfPage', 'mobileRectangle'),
  p('offerwall.native', 'Offerwall', 'Under the featured offers', 'native', 'native'),
  p('offerwall.bottom', 'Offerwall', 'Page footer', 'leaderboard', 'mobileLarge'),

  p('tasks.top', 'Tasks', 'Above the page header', 'leaderboard', 'mobileLarge'),
  p('tasks.inGrid', 'Tasks', 'Inside the task grid', 'inFeed', 'inFeed'),
  p('tasks.rail', 'Tasks', 'Right rail', 'halfPage', 'mobileRectangle'),
  p('tasks.native', 'Tasks', 'Under the task list', 'native', 'native'),
  p('tasks.bottom', 'Tasks', 'Page footer', 'leaderboard', 'mobileLarge'),

  /* ---- Daily / challenges / lottery -------------------------------------- */
  p('daily.top', 'Daily bonus', 'Above the page header', 'leaderboard', 'mobileLarge'),
  p('daily.afterClaim', 'Daily bonus', 'On the claim confirmation', 'largeRectangle', 'mobileRectangle'),
  p('daily.rail', 'Daily bonus', 'Right rail', 'halfPage', 'mobileRectangle'),
  p('daily.bottom', 'Daily bonus', 'Page footer', 'leaderboard', 'mobileLarge'),
  p('challenges.top', 'Challenges', 'Above the page header', 'leaderboard', 'mobileLarge'),
  p('challenges.inGrid', 'Challenges', 'Inside the challenge grid', 'inFeed', 'inFeed'),
  p('challenges.rail', 'Challenges', 'Right rail', 'halfPage', 'mobileRectangle'),
  p('challenges.bottom', 'Challenges', 'Page footer', 'leaderboard', 'mobileLarge'),
  p('lottery.top', 'Lottery', 'Above the page header', 'leaderboard', 'mobileLarge'),
  p('lottery.rail', 'Lottery', 'Right rail', 'halfPage', 'mobileRectangle'),
  p('lottery.bottom', 'Lottery', 'Page footer', 'leaderboard', 'mobileLarge'),

  /* ---- Social ------------------------------------------------------------ */
  p('leaderboard.top', 'Leaderboard', 'Above the page header', 'leaderboard', 'mobileLarge'),
  p('leaderboard.midTable', 'Leaderboard', 'After row 10 of the board', 'largeRectangle', 'mobileRectangle'),
  p('leaderboard.rail', 'Leaderboard', 'Right rail', 'halfPage', 'mobileRectangle'),
  p('leaderboard.bottom', 'Leaderboard', 'Page footer', 'leaderboard', 'mobileLarge'),
  p('referrals.top', 'Referrals', 'Above the page header', 'leaderboard', 'mobileLarge'),
  p('referrals.rail', 'Referrals', 'Right rail', 'halfPage', 'mobileRectangle'),
  p('referrals.bottom', 'Referrals', 'Page footer', 'leaderboard', 'mobileLarge'),
  p('community.top', 'Community', 'Above the page header', 'leaderboard', 'mobileLarge'),
  p('community.inFeed', 'Community', 'Inside the feed', 'inFeed', 'inFeed'),
  p('community.bottom', 'Community', 'Page footer', 'leaderboard', 'mobileLarge'),

  /* ---- Account ----------------------------------------------------------- */
  p('transactions.top', 'Transactions', 'Above the page header', 'leaderboard', 'mobileLarge'),
  p('transactions.midTable', 'Transactions', 'After row 15 of the ledger', 'largeRectangle', 'mobileRectangle'),
  p('transactions.bottom', 'Transactions', 'Page footer', 'leaderboard', 'mobileLarge'),
  p('account.top', 'Account', 'Above the page header', 'leaderboard', 'mobileLarge'),
  p('account.rail', 'Account', 'Right rail', 'rectangle', 'mobileRectangle'),
  p('account.bottom', 'Account', 'Page footer', 'leaderboard', 'mobileLarge'),
  p('tickets.top', 'Tickets', 'Above the page header', 'leaderboard', 'mobileLarge'),
  p('tickets.bottom', 'Tickets', 'Page footer', 'leaderboard', 'mobileLarge'),
  p('coupon.top', 'Coupon', 'Above the page header', 'leaderboard', 'mobileLarge'),
  p('coupon.bottom', 'Coupon', 'Page footer', 'leaderboard', 'mobileLarge'),

  /* ---- Withdraw (restricted) --------------------------------------------- */
  p('withdraw.top', 'Withdraw', 'Above the page header', 'leaderboard', 'mobileLarge', 'Above the header only — never inline with payout controls.'),
  p('withdraw.rail', 'Withdraw', 'Right rail, beside history', 'rectangle', 'mobileRectangle'),
  p('withdraw.belowCard', 'Withdraw', 'Below the entire transaction card', 'largeRectangle', 'mobileRectangle'),

  /* ---- Global ------------------------------------------------------------ */
  p('global.anchor', 'Global', 'Sticky bottom of viewport', 'anchor', 'anchor', 'Dismissible. Persists across navigation.'),
  p('global.socialBar', 'Global', 'Network-positioned', 'socialBar', 'socialBar', 'No container — the network places it.'),
  p('global.popunder', 'Global', 'Background tab', 'popunder', 'popunder', 'Fires once per session on first qualifying click.'),
  p('global.inPagePush', 'Global', 'Network-positioned', 'inPagePush', 'inPagePush'),
  p('global.interstitial', 'Global', 'Between navigations', 'interstitial', 'interstitial', 'Frequency-capped; never on the withdraw route.'),

  /* ---- Link inventory ---------------------------------------------------- */
  p('shortlink.directLink', 'Shortlinks', 'Smartlink destination', 'directLink', 'directLink', 'A URL, not a box. The shortlink engine sends users through it.'),
];

/** Index for O(1) lookup by id. */
export const PLACEMENT_BY_ID = PLACEMENTS.reduce<Record<string, Placement>>((acc, item) => {
  acc[item.id] = item;
  return acc;
}, {});

export function getPlacement(id: PlacementId): Placement {
  const found = PLACEMENT_BY_ID[id];
  if (!found) throw new Error(`Unknown ad placement: ${id}`);
  return found;
}

/** Grouped by page, for the admin inventory screen. */
export function placementsByPage(): Array<{ page: string; items: Placement[] }> {
  const map = new Map<string, Placement[]>();
  for (const item of PLACEMENTS) {
    const list = map.get(item.page) ?? [];
    list.push(item);
    map.set(item.page, list);
  }
  return [...map.entries()].map(([page, items]) => ({ page, items }));
}

/** Total reserved inventory, shown on the admin dashboard. */
export const INVENTORY_COUNT = PLACEMENTS.length;

/** Non-spatial placements, mounted once globally rather than per page. */
export const GLOBAL_PLACEMENTS = PLACEMENTS.filter(
  (item) => AD_FORMATS[item.format].kind === 'overlay' || item.id === 'global.anchor',
).map((item) => item.id);
