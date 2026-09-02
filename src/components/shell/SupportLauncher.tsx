'use client';

import * as React from 'react';
import { ChevronDown, MessageSquare } from 'lucide-react';

import { cn } from '@/lib/utils';

/* ============================================================================
   SUPPORT LAUNCHER
   The live product's floating element in this position is an unlabelled amber
   "Play Now!" casino promo. Here the persistent floating affordance is support
   — the only thing that earns a permanently-reserved corner of every screen.
   ========================================================================== */

export function SupportLauncher({
  open,
  unread,
  onToggle,
}: {
  open: boolean;
  unread: number;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={open ? 'Close support chat' : `Open support chat${unread ? `, ${unread} unread` : ''}`}
      className={cn(
        'fixed bottom-6 right-6 z-drawer grid size-[54px] place-items-center rounded-full',
        'bg-grad-signature text-on-grad shadow-mint transition-transform duration-base ease-spring',
        'hover:scale-105 active:scale-95',
        'max-lg:bottom-[calc(76px+env(safe-area-inset-bottom))] max-lg:right-4 max-lg:size-12',
      )}
    >
      {open ? (
        <ChevronDown aria-hidden="true" className="size-6" />
      ) : (
        <MessageSquare aria-hidden="true" className="size-6" />
      )}
      {!open && unread ? (
        <span className="absolute -right-[2px] -top-[2px] grid h-[19px] min-w-[19px] place-items-center rounded-full border-2 border-bg bg-danger px-1 text-[10px] font-bold text-on-danger">
          {unread}
        </span>
      ) : null}
    </button>
  );
}
