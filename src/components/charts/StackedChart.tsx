'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';
import { compact, tokens } from '@/lib/format';
import type { EarningDay, EarningSeries, EarningSourceKey } from '@/lib/models';

/* ============================================================================
   STACKED BAR + TREND HYBRID — hand-authored SVG, no charting library.
   ----------------------------------------------------------------------------
   Rationale: a 200KB dependency to draw seven bars is the wrong trade, and
   every library's default palette, tooltip and font fights the design system.
   This reads tokens directly, so it re-themes with the app for free.

   Fixes over the live chart:
   • Days with zero earnings render an explicit baseline marker and say "No
     earnings" on hover, instead of being an unexplained gap.
   • The legend toggles series, and a toggled-off series is removed from the
     tooltip total rather than silently still being counted.
   • A trend line over the daily totals gives the shape the bars alone do not.
   ========================================================================== */

const W = 720;
const PAD = { l: 44, r: 12, t: 16, b: 28 };

export interface StackedChartProps {
  rows: EarningDay[];
  series: EarningSeries[];
  height?: number;
  className?: string;
}

export function StackedChart({ rows, series, height = 220, className }: StackedChartProps) {
  const [hidden, setHidden] = React.useState<Set<EarningSourceKey>>(new Set());
  const [hover, setHover] = React.useState<number | null>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [tipX, setTipX] = React.useState(0);

  const active = series.filter((s) => !hidden.has(s.key));

  const H = height;
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;

  const totals = rows.map((r) => active.reduce((sum, s) => sum + (r[s.key] || 0), 0));
  const peak = Math.max(1, ...totals);
  const step = Math.pow(10, Math.floor(Math.log10(peak)));
  const top = Math.ceil(peak / step) * step || 1000;

  const bw = Math.min(46, (iw / rows.length) * 0.52);
  const x = (i: number) => PAD.l + (iw / rows.length) * (i + 0.5);
  const y = (v: number) => PAD.t + ih - (v / top) * ih;

  const linePath = totals.map((t, i) => `${i ? 'L' : 'M'}${x(i)},${y(t)}`).join(' ');
  const areaPath = `${linePath} L${x(rows.length - 1)},${PAD.t + ih} L${x(0)},${PAD.t + ih} Z`;

  const toggle = (key: EarningSourceKey) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box) return;
    const rel = (e.clientX - box.left) / box.width;
    const svgX = rel * W;
    const i = Math.floor(((svgX - PAD.l) / iw) * rows.length);
    setHover(i >= 0 && i < rows.length ? i : null);
    setTipX(Math.min(box.width - 158, Math.max(8, e.clientX - box.left - 79)));
  };

  const hoveredRow = hover !== null ? rows[hover] : undefined;

  return (
    <div>
      <div
        ref={wrapRef}
        className={cn('relative', className)}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHover(null)}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          style={{ width: '100%', height: H }}
          role="img"
          aria-label={`Earnings by day, stacked by source. ${rows
            .map((r, i) => `${r.d}: ${tokens(totals[i] ?? 0)} tokens`)
            .join('. ')}`}
        >
          <defs>
            <linearGradient id="vf-earn-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--mint)" stopOpacity="0.16" />
              <stop offset="100%" stopColor="var(--mint)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Gridlines + y axis */}
          {[0, 0.25, 0.5, 0.75, 1].map((f) => {
            const v = top * f;
            return (
              <g key={f}>
                <line
                  x1={PAD.l}
                  x2={W - PAD.r}
                  y1={y(v)}
                  y2={y(v)}
                  stroke="var(--line)"
                  strokeDasharray={f ? '2 4' : undefined}
                />
                <text
                  x={PAD.l - 8}
                  y={y(v) + 4}
                  textAnchor="end"
                  fill="var(--text-3)"
                  fontSize="10"
                  fontFamily="var(--font-mono)"
                >
                  {compact(v)}
                </text>
              </g>
            );
          })}

          <path d={areaPath} fill="url(#vf-earn-area)" />
          <path
            d={linePath}
            fill="none"
            stroke="var(--mint)"
            strokeWidth="1.5"
            strokeOpacity="0.55"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {rows.map((row, i) => {
            let acc = 0;
            const total = totals[i] ?? 0;
            return (
              <g key={row.d} opacity={hover === null || hover === i ? 1 : 0.55}>
                {active.map((s) => {
                  const v = row[s.key] || 0;
                  if (!v) return null;
                  const y0 = y(acc + v);
                  const h = Math.max(1.5, y(acc) - y(acc + v));
                  acc += v;
                  return (
                    <rect
                      key={s.key}
                      x={x(i) - bw / 2}
                      y={y0}
                      width={bw}
                      height={h}
                      fill={s.color}
                      opacity="0.9"
                      rx="2"
                    />
                  );
                })}
                {/* Explicit zero marker: an empty day is data, not a gap. */}
                {!total ? (
                  <rect
                    x={x(i) - bw / 2}
                    y={PAD.t + ih - 3}
                    width={bw}
                    height={3}
                    rx="1.5"
                    fill="var(--surface-3)"
                  />
                ) : null}
                <text
                  x={x(i)}
                  y={H - 8}
                  textAnchor="middle"
                  fill="var(--text-3)"
                  fontSize="10"
                  fontFamily="var(--font-mono)"
                >
                  {row.d}
                </text>
              </g>
            );
          })}
        </svg>

        {hoveredRow ? (
          <div
            className="pointer-events-none absolute top-2 z-[5] min-w-[150px] rounded-sm border border-line-strong bg-surface-3 p-3 text-11 shadow-md"
            style={{ left: tipX }}
          >
            <div className="mb-[6px] font-mono font-bold text-text">{hoveredRow.d}</div>
            {active.filter((s) => hoveredRow[s.key]).length === 0 ? (
              <div className="text-text-3">No earnings</div>
            ) : (
              active
                .filter((s) => hoveredRow[s.key])
                .map((s) => (
                  <div key={s.key} className="flex items-center gap-[6px] py-px text-text-2">
                    <i className="size-[7px] flex-none rounded-[2px]" style={{ background: s.color }} />
                    {s.label}
                    <b className="ml-auto font-mono tabular text-text">{tokens(hoveredRow[s.key])}</b>
                  </div>
                ))
            )}
            <div className="mt-[6px] flex justify-between border-t border-line pt-[6px] text-text-3">
              Total
              <b className="font-mono tabular text-text">
                {tokens(hover !== null ? (totals[hover] ?? 0) : 0)} tokens
              </b>
            </div>
          </div>
        ) : null}
      </div>

      {/* Legend — real toggle buttons, with pressed state announced. */}
      <div className="mt-4 flex flex-wrap gap-2">
        {series.map((s) => {
          const off = hidden.has(s.key);
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={!off}
              onClick={() => toggle(s.key)}
              className={cn(
                'inline-flex h-[26px] items-center gap-[6px] rounded-full border border-line bg-surface-2 px-3',
                'text-11 font-semibold text-text-2 transition-all duration-fast ease-out',
                'hover:border-line-strong hover:text-text',
                off && 'opacity-[0.42]',
              )}
            >
              <i
                className="size-2 flex-none rounded-[2px]"
                style={{ background: off ? 'var(--text-3)' : s.color }}
              />
              {s.label}
              <span className="sr-only">{off ? '(hidden)' : '(shown)'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
