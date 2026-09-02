import {
  AlertTriangle,
  BarChart3,
  Bot,
  Briefcase,
  Coins,
  Download,
  Droplet,
  Gift,
  Globe,
  Headphones,
  History,
  Inbox,
  Info,
  KeyRound,
  Landmark,
  Layers,
  LayoutDashboard,
  LifeBuoy,
  Link2,
  Lock,
  Megaphone,
  MessageSquare,
  Monitor,
  PieChart,
  Receipt,
  RefreshCw,
  Search,
  Send,
  Settings,
  Share2,
  ShieldCheck,
  Sparkles,
  Target,
  Ticket,
  TrendingUp,
  Trophy,
  UserCog,
  Users,
  Wallet,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import { canWithGrants, type AdminRole, type Permission } from './rbac';

/* ============================================================================
   ADMIN NAVIGATION MODEL
   ----------------------------------------------------------------------------
   Port of `ANAV` from the prototype's `src/admin/lib/ashell.js`, one entry per
   screen, in the same order and the same nine groups.

   Every entry declares the permission that REVEALS it. A Support admin does
   not see the treasury or the role editor — the nav is *built* from what the
   signed-in role holds, not rendered and then hidden with CSS. That matters
   for two reasons beyond tidiness: a CSS-hidden row is still in the DOM and
   still in the ⌘K palette, and a nav that lists 55 screens of which you can
   open 12 trains people to expect refusals.

   The permission on a nav item is the same permission `requirePermission()`
   enforces on the corresponding page, so the two can never disagree: both read
   `ADMIN_ROUTE_META`.

   Route ids are carried over from the prototype verbatim (`m-faucet`,
   `p-audit`, …) because they are the ⌘K palette keys and the audit-log
   `target` prefixes. The URL is separate and reads properly.
   ========================================================================== */

/** Badge keys → the live counters rendered on the nav rows. */
export type NavBadgeKey = 'kyc' | 'fraud' | 'cr' | 'wd' | 'ads' | 'tk';

export interface AdminNavItem {
  /** Prototype route id. Stable; also the ⌘K palette key. */
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  perm: Permission;
  badge?: NavBadgeKey;
}

export interface AdminNavGroup {
  group: string;
  items: readonly AdminNavItem[];
}

export const ANAV: readonly AdminNavGroup[] = [
  {
    group: 'Overview',
    items: [
      { id: 'overview', label: 'Command centre', href: '/admin', icon: LayoutDashboard, perm: 'analytics.view' },
    ],
  },
  {
    group: 'People',
    items: [
      { id: 'users', label: 'Users', href: '/admin/users', icon: Users, perm: 'user.view' },
      { id: 'kyc', label: 'KYC queue', href: '/admin/kyc', icon: ShieldCheck, perm: 'kyc.review', badge: 'kyc' },
      { id: 'fraud', label: 'Fraud clusters', href: '/admin/fraud', icon: AlertTriangle, perm: 'fraud.review', badge: 'fraud' },
      { id: 'requests', label: 'Change requests', href: '/admin/requests', icon: Inbox, perm: 'user.edit', badge: 'cr' },
    ],
  },
  {
    group: 'Money',
    items: [
      { id: 'payouts', label: 'Withdrawal queue', href: '/admin/payouts', icon: Wallet, perm: 'withdrawal.view', badge: 'wd' },
      { id: 'rails', label: 'Rail health', href: '/admin/rails', icon: Zap, perm: 'withdrawal.view' },
      { id: 'treasury', label: 'Treasury', href: '/admin/treasury', icon: Landmark, perm: 'treasury.view' },
      { id: 'rates', label: 'Rates', href: '/admin/rates', icon: TrendingUp, perm: 'rates.edit' },
      { id: 'limits', label: 'Fees & limits', href: '/admin/limits', icon: Settings, perm: 'limits.edit' },
      { id: 'accounting', label: 'Accounting', href: '/admin/accounting', icon: Receipt, perm: 'accounting.export' },
      { id: 'reversals', label: 'Reversals', href: '/admin/reversals', icon: RefreshCw, perm: 'withdrawal.reverse' },
    ],
  },
  {
    group: 'Earning modules',
    items: [
      { id: 'm-faucet', label: 'Faucet', href: '/admin/modules/faucet', icon: Droplet, perm: 'earn.view' },
      { id: 'm-ptc', label: 'PTC campaigns', href: '/admin/modules/ptc', icon: Megaphone, perm: 'earn.view' },
      { id: 'm-shortlinks', label: 'Shortlinks', href: '/admin/modules/shortlinks', icon: Link2, perm: 'earn.view' },
      { id: 'm-offerwall', label: 'Offerwall', href: '/admin/modules/offerwall', icon: Layers, perm: 'earn.view' },
      { id: 'm-lottery', label: 'Lottery', href: '/admin/modules/lottery', icon: Ticket, perm: 'earn.view' },
      { id: 'm-daily', label: 'Daily bonus', href: '/admin/modules/daily-bonus', icon: Gift, perm: 'earn.view' },
      { id: 'm-challenges', label: 'Challenges', href: '/admin/modules/challenges', icon: Target, perm: 'earn.view' },
      { id: 'm-coupons', label: 'Coupons', href: '/admin/modules/coupons', icon: Sparkles, perm: 'earn.view' },
      { id: 'm-leaderboard', label: 'Leaderboards', href: '/admin/modules/leaderboards', icon: Trophy, perm: 'earn.view' },
      { id: 'm-referral', label: 'Referral program', href: '/admin/modules/referrals', icon: Users, perm: 'earn.view' },
    ],
  },
  {
    group: 'Monetisation',
    items: [
      { id: 'adslots', label: 'Ad inventory', href: '/admin/ads/inventory', icon: Briefcase, perm: 'ads.view' },
      { id: 'adqueue', label: 'Advertiser queue', href: '/admin/ads/queue', icon: Inbox, perm: 'ads.approve', badge: 'ads' },
      { id: 'revenue', label: 'Revenue', href: '/admin/ads/revenue', icon: BarChart3, perm: 'ads.view' },
      { id: 'advertisers', label: 'Advertisers', href: '/admin/ads/advertisers', icon: Landmark, perm: 'advertiser.manage' },
    ],
  },
  {
    group: 'Support',
    items: [
      { id: 'tickets', label: 'Ticket inbox', href: '/admin/support/tickets', icon: LifeBuoy, perm: 'support.view', badge: 'tk' },
      { id: 'chats', label: 'Live chat queue', href: '/admin/support/chats', icon: MessageSquare, perm: 'support.view' },
      { id: 'kb', label: 'AI knowledge base', href: '/admin/support/kb', icon: Bot, perm: 'kb.edit' },
      { id: 'agents', label: 'Agent performance', href: '/admin/support/agents', icon: Headphones, perm: 'support.assign' },
      { id: 'broadcast', label: 'Broadcasts', href: '/admin/support/broadcasts', icon: Send, perm: 'broadcast.send' },
      { id: 'banners', label: 'Site banners', href: '/admin/support/banners', icon: AlertTriangle, perm: 'content.edit' },
      { id: 'emails', label: 'Email templates', href: '/admin/support/emails', icon: Inbox, perm: 'content.edit' },
    ],
  },
  {
    group: 'Analytics',
    items: [
      { id: 'a-financial', label: 'Financial', href: '/admin/analytics/financial', icon: BarChart3, perm: 'analytics.view' },
      { id: 'a-engagement', label: 'Engagement', href: '/admin/analytics/engagement', icon: TrendingUp, perm: 'analytics.view' },
      { id: 'a-geo', label: 'Geographic', href: '/admin/analytics/geo', icon: Globe, perm: 'analytics.view' },
      { id: 'a-funnel', label: 'Funnel', href: '/admin/analytics/funnel', icon: Target, perm: 'analytics.view' },
      { id: 'a-support', label: 'Support metrics', href: '/admin/analytics/support', icon: PieChart, perm: 'analytics.view' },
    ],
  },
  {
    group: 'Content',
    items: [
      { id: 'c-legal', label: 'Legal documents', href: '/admin/content/legal', icon: Receipt, perm: 'content.edit' },
      { id: 'c-faq', label: 'FAQ', href: '/admin/content/faq', icon: Info, perm: 'content.edit' },
      { id: 'c-social', label: 'Social widgets', href: '/admin/content/social', icon: Share2, perm: 'content.edit' },
      { id: 'c-coins', label: 'Supported coins', href: '/admin/content/coins', icon: Coins, perm: 'coins.manage' },
      { id: 'c-seo', label: 'SEO', href: '/admin/content/seo', icon: Search, perm: 'seo.edit' },
      { id: 'c-flags', label: 'Feature flags', href: '/admin/content/flags', icon: Zap, perm: 'flags.edit' },
      { id: 'c-maint', label: 'Maintenance mode', href: '/admin/content/maintenance', icon: AlertTriangle, perm: 'maintenance.toggle' },
    ],
  },
  {
    group: 'Platform',
    items: [
      { id: 'p-staff', label: 'Admin staff', href: '/admin/platform/staff', icon: UserCog, perm: 'admin.view' },
      { id: 'p-roles', label: 'Roles & permissions', href: '/admin/platform/roles', icon: Lock, perm: 'roles.edit' },
      { id: 'p-sessions', label: 'Sessions & IP', href: '/admin/platform/sessions', icon: Monitor, perm: 'admin.view' },
      { id: 'p-audit', label: 'Audit log', href: '/admin/platform/audit', icon: History, perm: 'audit.view' },
      { id: 'p-security', label: 'Security centre', href: '/admin/platform/security', icon: ShieldCheck, perm: 'audit.view' },
      { id: 'p-health', label: 'System health', href: '/admin/platform/health', icon: Zap, perm: 'system.view' },
      { id: 'p-keys', label: 'Keys & webhooks', href: '/admin/platform/keys', icon: KeyRound, perm: 'keys.manage' },
      { id: 'p-abuse', label: 'Anti-abuse', href: '/admin/platform/abuse', icon: ShieldCheck, perm: 'security.config' },
      { id: 'p-backups', label: 'Backups & GDPR', href: '/admin/platform/backups', icon: Download, perm: 'backup.run' },
      { id: 'p-changelog', label: 'Changelog', href: '/admin/platform/changelog', icon: History, perm: 'system.view' },
    ],
  },
];

/* ---- ROUTE META -------------------------------------------------------------
   Keyed by PATHNAME so a Server Component can resolve "what permission does
   this URL need, and what is it called" without importing the nav tree into a
   client bundle. `requirePermission()` and the denied surface both read this,
   which is what keeps the sidebar and the guard from ever disagreeing.     */
export interface AdminRouteMeta {
  id: string;
  title: string;
  group: string;
  perm: Permission;
}

export const ADMIN_ROUTE_META: Record<string, AdminRouteMeta> = Object.fromEntries(
  ANAV.flatMap((g) =>
    g.items.map((i) => [i.href, { id: i.id, title: i.label, group: g.group, perm: i.perm }] as const),
  ),
);

/* The user detail screen has no nav row of its own — it is reached from the
   users table — but it still needs a title and a permission. */
ADMIN_ROUTE_META['/admin/users/[uid]'] = {
  id: 'user-detail',
  title: 'User detail',
  group: 'People',
  perm: 'user.view',
};

export const ALL_ADMIN_ITEMS: readonly AdminNavItem[] = ANAV.flatMap((g) => g.items);

/** Nav badge counters. Server-rendered from real `count()` aggregates over the
    queues each badge points at — see `navCounts()` in `src/lib/admin/counts.ts`.
    A badge that disagreed with the table it links to would teach staff to ignore
    badges, so both read the same query. */
export interface NavCounts {
  kyc: number;
  fraud: number;
  cr: number;
  wd: number;
  ads: number;
  tk: number;
}

/** The nav groups this role can see, with empty groups dropped. */
export function visibleNav(
  role: AdminRole,
  overrides?: { perms?: readonly Permission[] | undefined },
): AdminNavGroup[] {
  return ANAV.map((g) => ({
    group: g.group,
    items: g.items.filter((i) => canWithGrants(role, i.perm, overrides)),
  })).filter((g) => g.items.length > 0);
}

/** How many console pages this role can actually reach. Counted from the nav
    model rather than the DOM, so it is correct during the initial render. */
export const visiblePageCount = (
  role: AdminRole,
  overrides?: { perms?: readonly Permission[] | undefined },
): number => visibleNav(role, overrides).reduce((n, g) => n + g.items.length, 0);

/** True when `href` is the active admin route. `/admin` is exact-matched — it
    is a prefix of every other admin URL, so `startsWith` would light up the
    command centre on every page. */
export const isActiveAdminRoute = (pathname: string, href: string): boolean =>
  href === '/admin' ? pathname === '/admin' : pathname === href || pathname.startsWith(`${href}/`);
