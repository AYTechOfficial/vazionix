import * as React from 'react';

import { cn } from '@/lib/utils';

/* ============================================================================
   KPI BAND
   ----------------------------------------------------------------------------
   The dense counter strip the prototype renders as `.kpis` on almost every
   admin screen. Denser than `<StatCard>` on purpose: an admin screen shows six
   to eight of these above the fold, and a 34px icon tile per card would push
   the actual work below the fold.

   Every value is mono + tabular, and every card carries a `sub` line. A bare
   number with no denominator is the single most common failure of an admin
   dashboard — "1,204" is not information until you know of what, since when.
   ========================================================================== */

export interface Kpi {
  label: string;
  /** Pre-formatted by the caller, which knows the unit. */
  value: React.ReactNode;
  sub?: React.ReactNode;
  /** Percentage delta. `null`/omitted renders no arrow at all rather than a
      grey 0.0%, which reads as "flat" when it means "not measured". */
  delta?: number | null;
  /** Renders the value in the danger hue — a breached threshold, not a
      decoration. Colour is never the only marker: the sub line says why. */
  tone?: 'default' | 'danger' | 'success';
}

export function KpiBand({ items, className }: { items: readonly Kpi[]; className?: string }) {
  if (!items.length) return null;
  return (
    <div
      className={cn(
        'grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(168px,1fr))]',
        className,
      )}
    >
      {items.map((k) => (
        <div key={k.label} className="rounded-md border border-line bg-surface-1 px-4 py-3">
          <div className="truncate text-11 font-medium uppercase tracking-wide text-text-3">
            {k.label}
          </div>
          <div
            className={cn(
              'mt-1.5 font-mono text-20 font-semibold tracking-[-0.02em] tabular',
              k.tone === 'danger' && 'text-danger',
              k.tone === 'success' && 'text-success',
              (!k.tone || k.tone === 'default') && 'text-text',
            )}
          >
            {k.value}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-11">
            {typeof k.delta === 'number' ? (
              <span className={cn('font-semibold', k.delta >= 0 ? 'text-success' : 'text-danger')}>
                <span aria-hidden="true">{k.delta >= 0 ? '↑' : '↓'}</span>{' '}
                <span className="tabular">{Math.abs(k.delta).toFixed(1)}%</span>
                <span className="sr-only">{k.delta >= 0 ? ' increase' : ' decrease'}</span>
              </span>
            ) : null}
            {k.sub ? <span className="truncate text-text-3">{k.sub}</span> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
