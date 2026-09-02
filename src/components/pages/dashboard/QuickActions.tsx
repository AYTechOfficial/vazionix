import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Droplet, Layers, Users, Wallet, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

/* ============================================================================
   QUICK ACTIONS
   ----------------------------------------------------------------------------
   The four things a returning user came to do, above the fold, each with a live
   subtitle rather than a fixed marketing claim. "Ready now" vs "Cooling down" is
   the difference between a link and a decision.
   ========================================================================== */

interface QuickAction {
  label: string;
  sub: string;
  href: string;
  icon: LucideIcon;
  tone: 'mint' | 'violet' | 'blue' | 'plain';
}

const TONE: Record<QuickAction['tone'], string> = {
  mint: 'bg-mint-dim text-mint',
  violet: 'bg-violet-dim text-violet-text',
  blue: 'bg-blue-dim text-blue-text',
  plain: 'bg-surface-3 text-text-2',
};

export interface QuickActionsProps {
  faucetReady: boolean;
  faucetLabel: string;
  providerCount: number;
  commissionRate: number;
  railCount: number;
}

export function QuickActions({
  faucetReady,
  faucetLabel,
  providerCount,
  commissionRate,
  railCount,
}: QuickActionsProps) {
  const actions: QuickAction[] = [
    {
      label: 'Claim faucet',
      sub: faucetReady ? 'Ready now' : faucetLabel,
      href: '/faucet',
      icon: Droplet,
      tone: 'mint',
    },
    {
      label: 'Open offerwall',
      sub: providerCount ? `${providerCount} provider${providerCount === 1 ? '' : 's'} live` : 'Coming soon',
      href: '/offerwall',
      icon: Layers,
      tone: 'violet',
    },
    {
      label: 'Invite a friend',
      sub: `${commissionRate}% for life`,
      href: '/referrals',
      icon: Users,
      tone: 'blue',
    },
    {
      label: 'Withdraw',
      sub: railCount ? `${railCount} payout options` : 'Not configured',
      href: '/withdraw',
      icon: Wallet,
      tone: 'plain',
    },
  ];

  return (
    <nav aria-label="Quick actions" className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {actions.map(({ label, sub, href, icon: Icon, tone }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            'group flex items-center gap-3 rounded-md border border-line bg-surface-1 px-4 py-3',
            'transition-[border-color,transform,background-color] duration-base ease-out',
            'hover:-translate-y-0.5 hover:border-line-strong hover:bg-surface-2 active:translate-y-0 active:scale-[0.99]',
          )}
        >
          <span
            className={cn(
              'grid size-[34px] flex-none place-items-center rounded-[10px] transition-transform duration-base ease-out',
              'group-hover:-rotate-[4deg] group-hover:scale-105',
              TONE[tone],
            )}
          >
            <Icon aria-hidden="true" className="size-[17px]" />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-13 font-semibold text-text">{label}</span>
            <span className="truncate text-11 text-text-3">{sub}</span>
          </span>
          <ArrowRight
            aria-hidden="true"
            className="ml-auto size-[15px] flex-none text-text-3 transition-transform duration-base ease-out group-hover:translate-x-[3px] group-hover:text-mint"
          />
        </Link>
      ))}
    </nav>
  );
}
