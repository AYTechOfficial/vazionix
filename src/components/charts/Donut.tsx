import * as React from 'react';

import { cn } from '@/lib/utils';

/* ============================================================================
   DONUT
   Replaces the live Referrals page's "Referral Source" card, which renders a
   370px blank white rectangle with no empty state and no data.

   Drawn with stroke-dasharray on a single circle per slice rather than arc
   paths: fewer nodes, and `stroke-linecap: round` gives the gap-and-cap look
   for free.
   ========================================================================== */

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

export interface DonutProps {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  center?: React.ReactNode;
  className?: string;
  title: string;
}

export function Donut({ slices, size = 168, thickness = 20, center, className, title }: DonutProps) {
  const total = slices.reduce((s, d) => s + d.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;

  let offset = 0;
  const arcs = slices.map((d) => {
    const len = (d.value / total) * c;
    const node = (
      <circle
        key={d.label}
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={d.color}
        strokeWidth={thickness}
        strokeDasharray={`${Math.max(0, len - 2)} ${c - len + 2}`}
        strokeDashoffset={-offset}
        strokeLinecap="round"
      >
        <title>{`${d.label}: ${Math.round((d.value / total) * 100)}%`}</title>
      </circle>
    );
    offset += len;
    return node;
  });

  return (
    <div className={cn('relative flex-none', className)} style={{ width: size, height: size }}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        role="img"
        aria-label={`${title}. ${slices
          .map((s) => `${s.label} ${Math.round((s.value / total) * 100)} percent`)
          .join(', ')}`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--surface-inset)"
          strokeWidth={thickness}
        />
        {arcs}
      </svg>
      {center ? (
        <div className="absolute inset-0 grid place-items-center text-center leading-[1.15]" aria-hidden="true">
          {center}
        </div>
      ) : null}
    </div>
  );
}
