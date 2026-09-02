import * as React from 'react';

import { cn } from '@/lib/utils';

/* ============================================================================
   TASK CARD
   ONE component standardises Faucet / PTC / Shortlinks / Offerwall cards. On
   the live site each of those four surfaces invents its own card shape, its
   own reward typography and its own disabled treatment, so a user has to
   re-learn the page every time they change earning method.
   ========================================================================== */

export interface TaskCardProps extends React.HTMLAttributes<HTMLElement> {
  /** Square glyph. Pass initials, a CoinIcon, or a provider mark. */
  thumb: React.ReactNode;
  title: string;
  desc?: React.ReactNode;
  meta?: React.ReactNode;
  /** Pre-formatted reward, e.g. "8.4M". The unit is rendered separately. */
  reward: React.ReactNode;
  rewardUnit?: string;
  action: React.ReactNode;
  /** Cap reached / cooldown active. Quiet, not red. */
  exhausted?: boolean;
  width?: number;
}

export function TaskCard({
  thumb,
  title,
  desc,
  meta,
  reward,
  rewardUnit = 'tokens',
  action,
  exhausted = false,
  width,
  className,
  ...props
}: TaskCardProps) {
  return (
    <article
      className={cn(
        'flex flex-col gap-3 rounded-md border border-line bg-surface-1 p-4',
        'transition-[border-color,background-color,transform] duration-base ease-out',
        exhausted ? 'opacity-[0.62]' : 'hover:-translate-y-0.5 hover:border-line-strong hover:bg-surface-2',
        className,
      )}
      style={width ? { width, flex: 'none' } : undefined}
      {...props}
    >
      <div className="flex items-start gap-3">
        <div className="grid size-10 flex-none place-items-center overflow-hidden rounded-[10px] border border-line bg-surface-3 font-display text-14 font-bold text-text">
          {thumb}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="truncate text-14 font-semibold tracking-[-0.01em] text-text">{title}</div>
          {desc ? <div className="line-clamp-2 text-12 leading-[1.45] text-text-3">{desc}</div> : null}
        </div>
      </div>

      {meta ? <div className="flex flex-wrap gap-2">{meta}</div> : null}

      <div className="mt-auto flex items-center justify-between gap-3">
        <span className="font-mono text-14 font-semibold tracking-[-0.02em] tabular text-mint">
          {reward}
          <span className="text-11 font-medium text-text-3"> {rewardUnit}</span>
        </span>
        {action}
      </div>
    </article>
  );
}

/** The 24px tinted glyph used in activity tables and "how it works" lists. */
export function SourceIcon({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: 'mint' | 'violet' | 'blue' | 'success' | 'warning' | 'danger' | 'neutral';
  className?: string;
  children: React.ReactNode;
}) {
  const map: Record<string, string> = {
    mint: 'bg-mint-dim text-mint',
    violet: 'bg-violet-dim text-violet-text',
    blue: 'bg-blue-dim text-blue-text',
    success: 'bg-success-dim text-success',
    warning: 'bg-warning-dim text-warning',
    danger: 'bg-danger-dim text-danger',
    neutral: 'bg-surface-3 text-text-2',
  };
  return (
    <span
      className={cn(
        'grid size-6 flex-none place-items-center rounded-[7px] [&_svg]:size-[13px]',
        map[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
