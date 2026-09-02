'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bell,
  CheckCircle2,
  Coins,
  Flame,
  LifeBuoy,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings,
  Sun,
  Ticket,
  User,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { metaFor } from '@/lib/nav';
import { relative, tokens } from '@/lib/format';
import { useCountUp, usePrefersReducedMotion } from '@/lib/hooks';
import { endpoints } from '@/lib/api';
import type { AppNotification, CoinTicker } from '@/lib/models';
import { IconButton } from '@/components/ui/Button';
import { Kbd } from '@/components/ui/CommandPalette';
import { Select } from '@/components/ui/Select';
import { Avatar } from '@/components/ui/Avatar';
import { Divider } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/components/providers/SessionProvider';
import { useRates, useTokenValue } from '@/components/providers/RatesProvider';
import { Dropdown, DropdownItem } from './Dropdown';

/* ============================================================================
   TOP BAR
   ----------------------------------------------------------------------------
   One balance chip in mono with tabular figures, animated on credit, showing the
   fiat estimate and its honest "varies with market price" disclosure. One icon
   grammar. Real menus.

   Notifications are read from `/api/notifications` on open rather than on mount:
   the bell's unread count comes down with the server-rendered profile, and the
   list itself is only worth a request when somebody actually looks at it.
   ========================================================================== */

const NOTIF_ICON: Record<AppNotification['icon'], LucideIcon> = {
  checkCircle: CheckCircle2,
  coins: Coins,
  users: Users,
  flame: Flame,
  ticket: Ticket,
};

const NOTIF_TONE: Record<AppNotification['tone'], string> = {
  success: 'bg-success-dim text-success',
  mint: 'bg-mint-dim text-mint',
  info: 'bg-info-dim text-info',
  warning: 'bg-warning-dim text-warning',
  violet: 'bg-violet-dim text-violet-text',
};

export function TopBar({
  onOpenPalette,
  onOpenDrawer,
}: {
  onOpenPalette: () => void;
  onOpenDrawer: () => void;
}) {
  const pathname = usePathname();
  const meta = metaFor(pathname);
  const { theme, toggleTheme } = useTheme();

  return (
    <header
      className={cn(
        'sticky top-0 z-sticky flex h-topbar flex-none items-center gap-3 px-5 max-lg:px-4',
        'border-b border-glass-line bg-glass-bg shadow-glass-inset backdrop-blur-[18px] backdrop-saturate-150',
        '[transform:translateZ(0)]',
      )}
    >
      <IconButton aria-label="Open navigation" onClick={onOpenDrawer} className="lg:hidden">
        <Menu />
      </IconButton>

      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-16 font-semibold tracking-[-0.02em]">{meta.title}</h1>
      </div>

      <button
        type="button"
        onClick={onOpenPalette}
        aria-label="Search and jump to any page"
        className={cn(
          'flex h-[34px] items-center gap-3 rounded-sm border border-line bg-surface-2 pl-3 pr-2 text-13 text-text-3',
          'transition-colors duration-fast ease-out hover:border-line-strong',
          'min-w-[200px] max-lg:w-[34px] max-lg:min-w-0 max-lg:justify-center max-lg:px-0',
        )}
      >
        <Search aria-hidden="true" className="size-[15px] flex-none" />
        <span className="flex-1 text-left max-lg:hidden">Search or jump to…</span>
        <span className="max-lg:hidden">
          <Kbd>⌘K</Kbd>
        </span>
      </button>

      <BalanceChip />

      <IconButton
        aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        onClick={toggleTheme}
      >
        {theme === 'dark' ? <Sun /> : <Moon />}
      </IconButton>

      <NotificationsMenu />
      <AccountMenu />
    </header>
  );
}

/* ---- NOTIFICATIONS -------------------------------------------------------- */

function NotificationsMenu() {
  const [list, setList] = React.useState<AppNotification[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const unread = list.filter((n) => n.unread).length;

  const load = React.useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const { notifications } = await endpoints.notifications();
      setList(notifications);
      setLoaded(true);
    } catch {
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }, [loading]);

  /* One read on mount so the badge is accurate; the list is reloaded on open. */
  React.useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markRead = async () => {
    setList((current) => current.map((n) => ({ ...n, unread: false })));
    try {
      await endpoints.markNotificationsRead();
    } catch {
      // The optimistic update stands; the next load corrects it if it failed.
    }
  };

  return (
    <Dropdown
      label="Notifications"
      width={340}
      trigger={({ toggle, ...aria }) => (
        <IconButton
          aria-label={`Notifications, ${unread} unread`}
          onClick={() => {
            toggle();
            void load();
          }}
          {...aria}
        >
          <Bell />
          {unread ? (
            <span className="absolute right-[6px] top-[6px] grid h-[15px] min-w-[15px] place-items-center rounded-full border-2 border-bg bg-danger px-[3px] text-[9px] font-bold text-on-danger">
              {unread}
            </span>
          ) : null}
        </IconButton>
      )}
    >
      <div className="flex items-center justify-between px-3 py-2">
        <strong className="text-13">Notifications</strong>
        {unread ? (
          <button
            type="button"
            onClick={markRead}
            className="text-12 font-semibold text-text-2 transition-colors duration-fast ease-out hover:text-text"
          >
            Mark all read
          </button>
        ) : null}
      </div>

      <div className="max-h-[340px] overflow-y-auto">
        {!loaded ? (
          <p className="px-3 py-6 text-center text-12 text-text-3">Loading…</p>
        ) : list.length === 0 ? (
          <p className="px-3 py-6 text-center text-12 text-text-3">
            Nothing yet. Claims, referrals and withdrawals show up here.
          </p>
        ) : (
          list.map((n) => {
            const Icon = NOTIF_ICON[n.icon] ?? Coins;
            const body = (
              <>
                <span className={cn('grid size-[30px] flex-none place-items-center rounded-[8px]', NOTIF_TONE[n.tone])}>
                  <Icon aria-hidden="true" className="size-[15px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-13 font-semibold text-text">{n.title}</span>
                  <span className="block text-12 text-text-3">{n.body}</span>
                </span>
                <span className="whitespace-nowrap text-12 text-text-3">{relative(n.at)}</span>
              </>
            );
            const className = cn(
              'flex w-full gap-3 rounded-sm p-3 text-left transition-colors duration-fast ease-out hover:bg-surface-3',
              n.unread && 'bg-mint-dim',
            );

            return n.href ? (
              <a key={n.id} href={n.href} className={className}>
                {body}
              </a>
            ) : (
              <div key={n.id} className={className}>
                {body}
              </div>
            );
          })
        )}
      </div>

      <Divider className="my-2" />
      <DropdownItem href="/account">
        <Settings aria-hidden="true" /> Notification settings
      </DropdownItem>
    </Dropdown>
  );
}

/* ---- ACCOUNT -------------------------------------------------------------- */

function AccountMenu() {
  const { profile } = useSession();
  const router = useRouter();
  const [signingOut, setSigningOut] = React.useState(false);

  const signOut = async () => {
    setSigningOut(true);
    try {
      /* Two halves: clear the httpOnly cookie server-side (which also revokes the
         refresh tokens) and drop the client SDK's own credential. Skipping either
         leaves the user signed in somewhere. */
      await fetch('/api/auth/session', { method: 'DELETE', credentials: 'include' });
      const { getFirebaseAuth } = await import('@/lib/firebase/client');
      const auth = getFirebaseAuth();
      if (auth) {
        const { signOut: fbSignOut } = await import('firebase/auth');
        await fbSignOut(auth);
      }
    } finally {
      router.push('/login');
      router.refresh();
    }
  };

  const initials = profile?.initials ?? 'VZ';

  return (
    <Dropdown
      label="Account menu"
      trigger={({ toggle, ...aria }) => (
        <button
          type="button"
          onClick={toggle}
          aria-label="Account menu"
          className="rounded-sm p-[3px] transition-colors duration-fast ease-out hover:bg-surface-2"
          {...aria}
        >
          <Avatar initials={initials} />
        </button>
      )}
    >
      <div className="flex items-center gap-3 p-3">
        <Avatar initials={initials} size="lg" />
        <span className="flex min-w-0 flex-col">
          <strong className="text-13">{profile?.username ?? 'Member'}</strong>
          <span className="truncate text-11 text-text-3">{profile?.email ?? ''}</span>
          {profile ? (
            <Pill tone="mint" className="mt-1 w-fit">
              Level {profile.level} · {profile.tier}
            </Pill>
          ) : null}
        </span>
      </div>

      {profile && !profile.emailVerified ? (
        <p className="mx-3 mb-2 rounded-sm border border-warning/40 bg-warning/10 px-2 py-1.5 text-11 text-warning">
          Verify your email to enable withdrawals.
        </p>
      ) : null}

      <Divider className="my-2" />
      <DropdownItem href="/account">
        <User aria-hidden="true" /> Profile &amp; settings
      </DropdownItem>
      <DropdownItem href="/withdraw">
        <Wallet aria-hidden="true" /> Withdraw funds
      </DropdownItem>
      <DropdownItem href="/tickets">
        <LifeBuoy aria-hidden="true" /> Support
      </DropdownItem>
      <Divider className="my-2" />
      <button
        type="button"
        onClick={signOut}
        disabled={signingOut}
        className={cn(
          'flex w-full items-center gap-3 rounded-sm px-3 py-2 text-13 text-danger',
          'transition-colors duration-fast ease-out hover:bg-surface-3 disabled:opacity-60',
          '[&>svg]:size-[15px]',
        )}
      >
        <LogOut aria-hidden="true" /> {signingOut ? 'Signing out…' : 'Log out'}
      </button>
    </Dropdown>
  );
}

/* ---- BALANCE CHIP ---------------------------------------------------------
   The number ticks up with an eased count, the chip border pulses mint, and a
   floating "+65" rises out of it on every credit.                          */
function BalanceChip() {
  const { balance, lockedBalance, lastDelta, currency, setCurrency } = useSession();
  const { currencies } = useRates();
  const valueIn = useTokenValue();
  const animated = useCountUp(balance, 700);
  const reduced = usePrefersReducedMotion();
  const [bumping, setBumping] = React.useState(false);

  React.useEffect(() => {
    if (!lastDelta) return;
    setBumping(true);
    const id = window.setTimeout(() => setBumping(false), 720);
    return () => window.clearTimeout(id);
  }, [lastDelta]);

  return (
    <div
      data-tip={
        lockedBalance
          ? `${tokens(lockedBalance)} tokens locked by a queued withdrawal · estimated value varies with market price`
          : 'Estimated value — varies with market price'
      }
      className={cn(
        'tip relative flex h-9 items-center gap-3 rounded-sm border bg-surface-2 pl-3 pr-2 max-sm:hidden',
        bumping ? 'animate-bal-bump border-mint' : 'border-line',
      )}
    >
      <span className="flex flex-col leading-[1.15]">
        <span className="font-mono text-14 font-semibold tracking-[-0.02em] tabular text-text">
          {tokens(animated)}
        </span>
        <span className="font-mono text-11 tabular text-text-3">
          ≈ {valueIn(balance, currency)} {currency}
        </span>
      </span>

      <Select
        size="sm"
        aria-label="Display currency"
        value={currency}
        onChange={(e) => setCurrency(e.target.value as CoinTicker)}
      >
        {currencies.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </Select>

      <AnimatePresence>
        {lastDelta && bumping && !reduced ? (
          <motion.span
            key={lastDelta.nonce}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: [0, 1, 0], y: -14 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.4, ease: [0.22, 0.61, 0.36, 1] }}
            className="pointer-events-none absolute -top-[6px] right-2 font-mono text-11 font-bold tabular text-mint"
          >
            +{tokens(lastDelta.amount)}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
