import * as React from 'react';

import { cn } from '@/lib/utils';

/* ============================================================================
   EMPTY STATE
   Never a bare "There is no record" inside a six-column skeleton — which is
   literally what the live Withdraw history, Tickets and Campaigns pages ship.
   Art + why it is empty + what to do next.
   ========================================================================== */

export interface EmptyStateProps {
  art?: 'inbox' | 'success' | 'search';
  title: string;
  body?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ art = 'inbox', title, body, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center gap-4 px-6 py-12 text-center', className)}>
      <EmptyArt kind={art} />
      <div className="text-16 font-semibold text-text">{title}</div>
      {body ? <div className="max-w-[42ch] text-13 leading-body text-text-3">{body}</div> : null}
      {action ? <div className="mt-2 flex items-center gap-3">{action}</div> : null}
    </div>
  );
}

/** Hand-authored line art, on the same 1.75-stroke geometry as the icon set.
    Stroke colours are token references so it retints with the theme. */
function EmptyArt({ kind }: { kind: NonNullable<EmptyStateProps['art']> }) {
  if (kind === 'success') {
    return (
      <svg viewBox="0 0 96 96" fill="none" aria-hidden="true" className="size-24 opacity-90">
        <circle cx="48" cy="48" r="30" stroke="var(--mint)" strokeWidth="2.5" />
        <path
          d="m36 48.5 8.5 8.5L61 40"
          stroke="var(--mint)"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="48" cy="48" r="40" stroke="var(--line)" strokeWidth="1.5" strokeDasharray="4 6" />
      </svg>
    );
  }

  if (kind === 'search') {
    return (
      <svg viewBox="0 0 96 96" fill="none" aria-hidden="true" className="size-24 opacity-90">
        <circle cx="43" cy="43" r="22" stroke="var(--line-strong)" strokeWidth="2.5" />
        <path d="m59 59 14 14" stroke="var(--mint)" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M34 43h18" stroke="var(--line-strong)" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 96 96" fill="none" aria-hidden="true" className="size-24 opacity-90">
      <rect x="14" y="26" width="68" height="46" rx="8" stroke="var(--line-strong)" strokeWidth="2" />
      <path d="M14 40h68" stroke="var(--line-strong)" strokeWidth="2" />
      <circle cx="66" cy="56" r="9" stroke="var(--mint)" strokeWidth="2" />
      <path
        d="m62.5 56 2.6 2.6L70 53.5"
        stroke="var(--mint)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M24 52h22M24 60h14" stroke="var(--line-strong)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
