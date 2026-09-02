import * as React from 'react';

import { cn, clamp } from '@/lib/utils';

/* ============================================================================
   PROGRESS BAR + RING
   Both expose real ARIA progressbar semantics. The live product's level bar is
   a bare <div> with a width, announced as nothing at all.
   ========================================================================== */

export interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  size?: 'md' | 'lg';
  /** The reserved three-stop gradient. Streak/level only, never generic. */
  gradient?: boolean;
  label?: string;
}

export function ProgressBar({
  value,
  max = 100,
  size = 'md',
  gradient = false,
  label,
  className,
  ...props
}: ProgressBarProps) {
  const p = clamp(max ? value / max : 0) * 100;
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
      className={cn(
        'overflow-hidden rounded-full border border-line bg-surface-inset',
        size === 'lg' ? 'h-[10px]' : 'h-[6px]',
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          'h-full rounded-[inherit] transition-[width] duration-[800ms] ease-out',
          gradient ? 'bg-grad-signature' : 'bg-mint',
        )}
        style={{ width: `${p}%` }}
      />
    </div>
  );
}

export interface ProgressRingProps {
  value: number;
  max: number;
  size?: number;
  thickness?: number;
  /** Any CSS colour *token* reference. Defaults to the accent. */
  color?: string;
  label?: React.ReactNode;
  srLabel?: string;
  className?: string;
}

/**
 * Radial progress — faucet cooldown, level, security score. Rendered as SVG
 * with a dash-offset so it animates on the compositor and needs no layout.
 */
export function ProgressRing({
  value,
  max,
  size = 92,
  thickness = 7,
  color = 'var(--mint)',
  label,
  srLabel,
  className,
}: ProgressRingProps) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const p = clamp(max ? value / max : 0);

  return (
    <div
      className={cn('relative grid flex-none place-items-center', className)}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={srLabel}
    >
      <svg width={size} height={size} className="-rotate-90 overflow-visible" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={thickness}
          stroke="var(--surface-3)"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={thickness}
          stroke={color}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          className="transition-[stroke-dashoffset] duration-[900ms] ease-out"
        />
      </svg>
      {label ? (
        <div className="absolute text-center leading-[1.15]" aria-hidden="true">
          {label}
        </div>
      ) : null}
    </div>
  );
}
