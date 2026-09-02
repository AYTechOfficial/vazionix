'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Droplet, Layers, LayoutDashboard, Trophy, Wallet, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { isActiveRoute } from '@/lib/nav';

/* ============================================================================
   MOBILE TAB BAR
   Five destinations, chosen by what people actually open on a phone: the home
   view, the two fastest earners, the payout page, and the contest that brings
   them back. Everything else lives behind the drawer.

   Glass, but a *floored* glass: pure alpha over a scrolling list makes the
   labels unreadable, so it gets an opaque backing colour.
   ========================================================================== */

const TABS: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { href: '/faucet', label: 'Faucet', icon: Droplet },
  { href: '/offerwall', label: 'Offers', icon: Layers },
  { href: '/withdraw', label: 'Withdraw', icon: Wallet },
  { href: '/leaderboard', label: 'Ranks', icon: Trophy },
];

export function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className={cn(
        'fixed inset-x-0 bottom-0 z-sticky grid h-[62px] grid-cols-5 lg:hidden',
        'border-t border-glass-line bg-surface-1/95 backdrop-blur-[18px] backdrop-saturate-150',
        'pb-[env(safe-area-inset-bottom)]',
      )}
    >
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = isActiveRoute(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex flex-col items-center justify-center gap-[3px] text-[10px] font-semibold',
              active ? 'text-mint' : 'text-text-3',
            )}
          >
            <Icon aria-hidden="true" className="size-5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
