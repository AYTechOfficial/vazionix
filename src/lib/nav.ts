import {
  Droplet,
  Gift,
  LayoutDashboard,
  Layers,
  LifeBuoy,
  Link2,
  Megaphone,
  MessageSquare,
  Receipt,
  Settings,
  Sparkles,
  Target,
  Ticket,
  Trophy,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

import { brand } from '@/lib/brand';

/* ============================================================================
   NAVIGATION MODEL
   ----------------------------------------------------------------------------
   Grouped by JOB — what the user came to do — rather than by the order features
   were built:

     Earn      → the things that put tokens in the account
     Grow      → the things that multiply what you earn
     Wallet    → the things that move money out
     Account   → support, community, settings

   Every route here has a real page. Nothing 404s.

   NO STATIC BADGES. An earlier revision imported catalogue counts from a fixture
   module and rendered them as sidebar badges, which meant the badge disagreed
   with the page the moment either changed. Live counts belong to the page, not to
   the nav — a badge that lies is worse than no badge.
   ========================================================================== */

export interface NavItem {
  /** Stable id, also the command-palette key. */
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
  badgeKind?: 'live' | 'hot';
  children?: Array<Pick<NavItem, 'id' | 'label' | 'href'>>;
}

export interface NavGroup {
  group: string;
  items: NavItem[];
}

export const DASHBOARD_ITEM: NavItem = {
  id: 'dashboard',
  label: 'Dashboard',
  href: '/dashboard',
  icon: LayoutDashboard,
};

export const NAV: NavGroup[] = [
  {
    group: 'Earn',
    items: [
      { id: 'faucet', label: 'Faucet', href: '/faucet', icon: Droplet },
      { id: 'ptc', label: 'PTC ads', href: '/ptc', icon: Megaphone },
      { id: 'shortlinks', label: 'Shortlinks', href: '/shortlinks', icon: Link2 },
      {
        id: 'offerwall',
        label: 'Offerwall',
        href: '/offerwall',
        icon: Layers,
        children: [
          { id: 'offerwall', label: 'Browse offers', href: '/offerwall' },
          { id: 'offerwall-history', label: 'History', href: '/offerwall/history' },
        ],
      },
      { id: 'daily-bonus', label: 'Daily bonus', href: '/daily-bonus', icon: Gift },
      { id: 'challenges', label: 'Challenges', href: '/challenges', icon: Target },
      { id: 'lottery', label: 'Lottery', href: '/lottery', icon: Ticket },
    ],
  },
  {
    group: 'Grow',
    items: [
      { id: 'referrals', label: 'Referrals', href: '/referrals', icon: Users },
      { id: 'leaderboard', label: 'Leaderboard', href: '/leaderboard', icon: Trophy },
      { id: 'coupon', label: 'Coupons', href: '/coupon', icon: Sparkles },
    ],
  },
  {
    group: 'Wallet',
    items: [
      { id: 'withdraw', label: 'Withdraw', href: '/withdraw', icon: Wallet },
      { id: 'transactions', label: 'Transactions', href: '/transactions', icon: Receipt },
    ],
  },
  {
    group: 'Account',
    items: [
      { id: 'tickets', label: 'Support', href: '/tickets', icon: LifeBuoy },
      { id: 'community', label: 'Community', href: '/community', icon: MessageSquare },
      { id: 'account', label: 'Settings', href: '/account', icon: Settings },
    ],
  },
];

/* ---- ROUTE META ------------------------------------------------------------
   Title and subtitle for the top bar. Deliberately free of numbers: anything
   countable is rendered by the page from a live read, so this map cannot go
   stale.                                                                    */
export interface RouteMeta {
  title: string;
  sub: string;
}

export const ROUTE_META: Record<string, RouteMeta> = {
  '/dashboard': { title: 'Dashboard', sub: 'Your earnings at a glance' },
  '/faucet': { title: 'Faucet', sub: 'Claim on a timer' },
  '/ptc': { title: 'PTC ads', sub: 'Paid to click, paid on completion' },
  '/shortlinks': { title: 'Shortlinks', sub: 'Caps reset at 00:00 UTC' },
  '/offerwall': { title: 'Offerwall', sub: 'The highest-paying way to earn here' },
  '/offerwall/history': { title: 'Offerwall history', sub: 'Every conversion and its credit status' },
  '/daily-bonus': { title: 'Daily bonus', sub: 'A compounding streak' },
  '/challenges': { title: 'Challenges', sub: 'Quests with token and experience rewards' },
  '/lottery': { title: 'Lottery', sub: 'Weekly draw from a published seed' },
  '/referrals': { title: 'Referrals', sub: 'Earn a lifetime share of what your invites earn' },
  '/leaderboard': { title: 'Leaderboard', sub: 'Five contests, reset weekly' },
  '/coupon': { title: 'Coupons', sub: 'Redeem a code for tokens or ad credit' },
  '/withdraw': { title: 'Withdraw', sub: 'Every fee shown before you confirm' },
  '/transactions': { title: 'Transactions', sub: 'Every credit and debit on your account' },
  '/tickets': { title: 'Support', sub: 'Tickets go to a human' },
  '/community': { title: 'Community', sub: 'What is happening across the platform' },
  '/account': { title: 'Settings', sub: 'Profile, security, notifications' },
};

export const metaFor = (pathname: string): RouteMeta =>
  ROUTE_META[pathname] ?? { title: brand.name, sub: '' };

/** Flattened nav for the command palette and the mobile tab bar. */
export const ALL_NAV_ITEMS: NavItem[] = [DASHBOARD_ITEM, ...NAV.flatMap((g) => g.items)];

/** True when `href` is the active route (a parent matches its children). */
export const isActiveRoute = (pathname: string, href: string): boolean =>
  pathname === href || pathname.startsWith(`${href}/`);
