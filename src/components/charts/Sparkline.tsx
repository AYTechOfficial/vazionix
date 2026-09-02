import * as React from 'react';

/* ============================================================================
   SPARKLINE — monochrome, no axes, no labels.
   ----------------------------------------------------------------------------
   Takes real values. An all-zero series draws a flat baseline rather than a
   random shape, because a sparkline that invents movement on an account with no
   activity is worse than no sparkline at all.
   ========================================================================== */

export interface SparklineProps {
  /** Chronological values, oldest first. */
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

export function Sparkline({
  values,
  width = 96,
  height = 26,
  color = 'var(--mint)',
  className,
}: SparklineProps) {
  const points = values.length >= 2 ? values : [0, 0];
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const flat = max === 0;

  const d = points
    .map((v, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = flat ? height - 1.5 : height - ((v - min) / span) * (height - 3) - 1.5;
      return `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      className={className}
      style={{ overflow: 'visible' }}
    >
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={flat ? 0.35 : 0.85}
      />
    </svg>
  );
}
