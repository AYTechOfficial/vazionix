/* ============================================================================
   BRAND — single source of truth
   ----------------------------------------------------------------------------
   Every user-visible occurrence of the product name, domain, support address
   and social handle resolves through this module. Nothing hardcodes the string
   "Vazionix" anywhere else, so a rename is one edit here plus the logo mark.

   Domain and site URL come from the environment because the same build runs on
   localhost, a preview deploy and production, and referral links must be
   absolute and correct in all three.
   ========================================================================== */

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

export const brand = {
  /** Full product name, used in titles, headings and legal copy. */
  name: 'Vazionix',
  /** Short form for tight spaces (mobile tab bar, favicon alt, table cells). */
  short: 'Vazionix',
  /** Two-letter monogram for the logo mark and avatar fallbacks. */
  mark: 'VZ',
  /** Lowercase slug used in cookie names, CSS class prefixes and CSV filenames. */
  slug: 'vazionix',

  tagline: 'Earn crypto in seconds. Cash out instantly.',
  description:
    'Earn crypto from a faucet, PTC ads, shortlinks and offerwalls. Instant withdrawals via FaucetPay, CWallet and direct on-chain payouts.',

  /** Absolute origin. Never ends with a slash. */
  url: SITE_URL,
  /** Bare host for display ("vazionix.com"), derived so it cannot drift. */
  get domain(): string {
    try {
      return new URL(SITE_URL).host;
    } catch {
      return 'vazionix.com';
    }
  },

  email: {
    support: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'support@vazionix.com',
    noreply: process.env.NEXT_PUBLIC_NOREPLY_EMAIL ?? 'noreply@vazionix.com',
  },

  social: {
    x: process.env.NEXT_PUBLIC_SOCIAL_X ?? '@vazionix',
    telegram: process.env.NEXT_PUBLIC_SOCIAL_TELEGRAM ?? 'https://t.me/vazionix',
    discord: process.env.NEXT_PUBLIC_SOCIAL_DISCORD ?? '',
  },

  /** The in-product AI support persona. */
  assistant: 'Vazionix Assistant',

  /** Internal currency unit, shown beside every earning value. */
  token: {
    singular: 'token',
    plural: 'tokens',
  },
} as const;

/* ---- COOKIE NAMES ---------------------------------------------------------
   Prefixed with the brand slug so two products on sibling subdomains cannot
   clobber each other's state. Centralised because a typo in a cookie name
   fails silently — the value just never reads back.                        */
export const cookies = {
  session: `${brand.slug}-session`,
  sidebar: `${brand.slug}-sidebar`,
  adminSidebar: `${brand.slug}-admin-sidebar`,
  adminRole: `${brand.slug}-admin-role`,
  theme: `${brand.slug}-theme`,
} as const;

/** Absolute URL builder. `path` may or may not start with a slash. */
export const absoluteUrl = (path = '/'): string =>
  `${brand.url}${path.startsWith('/') ? path : `/${path}`}`;

/** Referral link for a given code. One definition, used by the share block,
    the QR generator and the copy button alike. */
export const referralUrl = (code: string): string => absoluteUrl(`/?r=${encodeURIComponent(code)}`);
