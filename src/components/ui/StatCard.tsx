import * as React from 'react';
import { type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { InfoHint } from './Tooltip';

/* ============================================================================
   STAT CARD
   ----------------------------------------------------------------------------
   The live dashboard's three KPI cards print bare numbers with no units at all
   ("Balance 6,851.79", "Earning Bonus 0.7") and an emoji tile on the right.
   Here every value is mono + tabular, carries a `unit`, and the icon is a
   real icon in a bordered tile.

   `hero` is the ONE gradient-glass card in the app (primary balance). It is
   reserved — nothing else may use it.
   ========================================================================== */

export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  /** Pre-formatted. Formatting belongs to the caller (it knows the unit). */
  value: React.ReactNode;
  /** The unit, always rendered. Money without a unit is not money. */
  unit?: string;
  sub?: React.ReactNode;
  icon?: LucideIcon;
  hint?: string;
  hero?: boolean;
  /** Slot under the value: sparkline, progress bar, button row. */
  children?: React.ReactNode;
}

export function StatCard({
  label,
  value,
  unit,
  sub,
  icon: Icon,
  hint,
  hero = false,
  className,
  children,
  ...props
}: StatCardProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-md border p-5',
        hero ? 'stat-hero border-line-strong' : 'border-line bg-surface-1',
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-2 text-12 font-medium text-text-2">
        {label}
        {hint ? <InfoHint tip={hint} /> : null}
      </div>

      <div className="mt-3 font-mono text-32 font-semibold leading-[1.1] tracking-[-0.035em] tabular text-text">
        {value}
        {unit ? <span className="ml-1 text-16 font-medium text-text-2">{unit}</span> : null}
      </div>

      {sub ? <div className="mt-2 text-12 text-text-3">{sub}</div> : null}

      {Icon ? (
        <div
          className={cn(
            'absolute right-5 top-5 grid size-[34px] place-items-center rounded-sm border',
            hero
              ? 'border-line-strong bg-[rgba(255,255,255,0.06)] text-mint'
              : 'border-line bg-surface-2 text-text-2',
          )}
        >
          <Icon aria-hidden="true" className="size-[17px]" />
        </div>
      ) : null}

      {children}
    </div>
  );
}

/** Up/down delta text. Carries an arrow glyph as well as colour, because
    colour alone fails for ~8% of male users. */
export function Delta({ value, suffix }: { value: number; suffix?: string }) {
  const up = value >= 0;
  return (
    <span className={cn('font-medium', up ? 'text-success' : 'text-danger')}>
      <span aria-hidden="true">{up ? '↑' : '↓'}</span>{' '}
      <span className="tabular">{Math.abs(value).toFixed(1)}%</span>
      <span className="sr-only">{up ? ' increase' : ' decrease'}</span>
      {suffix ? <span className="ml-1 text-text-3">{suffix}</span> : null}
    </span>
  );
}
