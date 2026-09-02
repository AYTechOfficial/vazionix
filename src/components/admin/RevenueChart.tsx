'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';
import { usd } from '@/lib/format';

/* ============================================================================
   PAYOUTS vs ACCRUED LIABILITY — admin
   ----------------------------------------------------------------------------
   The user-facing `StackedChart` is typed to `EarningSourceKey` (faucet, ptc,
   offerwall, bonus, challenge). This one plots the two money series the platform
   actually records per day, and the pair is chosen deliberately:

     PAID OUT   `usdWithdrawn` from /stats/daily — money that left.
     ACCRUED    `tokensCredited` × the current usdPerToken — liability created by
                crediting users, which is what a payout later settles.

   THERE IS NO REVENUE SERIES AND NO PROFIT SERIES HERE. Nothing in this codebase
   observes ad revenue: an impression is counted, but what a network paid for it is
   known only to the network. A "profit" line would be the difference between one
   measured number and one invented one, which is worse than no line at all.

   Hand-authored SVG for the same reason as everywhere else in this bundle: a
   charting dependency to draw thirty bars is the wrong trade. The legend TOGGLES,
   and a toggled-off series leaves the total — a legend that only recolours is
   decoration.
   ========================================================================== */

const W = 720;
const PAD = { l: 52, r: 12, t: 14, b: 26 };

export interface RevenueRow {
  /** YYYY-MM-DD, as `/stats/daily/days/{day}` stores it. */
  day: string;
  paidOutUsd: number;
  accruedUsd: number;
}

type SeriesKey = 'paidOutUsd' | 'accruedUsd';

const SERIES: Array<{ key: SeriesKey; label: string; varName: string }> = [
  { key: 'accruedUsd', label: 'Accrued to balances', varName: '--mint' },
  { key: 'paidOutUsd', label: 'Paid out', varName: '--violet' },
];

export function RevenueChart({ rows, height = 210 }: { rows: readonly RevenueRow[]; height?: number }) {
  const [hidden, setHidden] = React.useState<Set<SeriesKey>>(new Set());
  const [hover, setHover] = React.useState<number | null>(null);

  const active = SERIES.filter((s) => !hidden.has(s.key));
  const iw = W - PAD.l - PAD.r;
  const ih = height - PAD.t - PAD.b;

  const totals = rows.map((r) => active.reduce((sum, s) => sum + r[s.key], 0));
  const peak = Math.max(1, ...totals);
  const step = Math.pow(10, Math.floor(Math.log10(peak)));
  const top = Math.ceil(peak / step) * step || 1;

  const bw = Math.min(34, (iw / Math.max(1, rows.length)) * 0.56);
  const x = (i: number) => PAD.l + (iw / Math.max(1, rows.length)) * (i + 0.5);
  const y = (v: number) => PAD.t + ih - (v / top) * ih;

  const toggle = (key: SeriesKey) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else if (next.size < SERIES.length - 1) next.add(key);
      return next;
    });

  const hoveredRow = hover === null ? null : rows[hover];

  /* An empty series is a real state on a fresh install: /stats/daily has no
     documents until the first claim. Say so rather than drawing an axis with
     nothing on it, which reads as a broken chart. */
  if (!rows.length) {
    return (
      <p className="py-8 text-center text-13 text-text-3">
        No daily counters recorded yet. <code className="font-mono text-12">/stats/daily/days</code> fills
        from the first credit and the first payout.
      </p>
    );
  }

  return (
    <div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${height}`}
          className="w-full"
          role="img"
          aria-label={`Tokens accrued to balances and USD paid out over the last ${rows.length} days`}
          onMouseLeave={() => setHover(null)}
        >
          {/* Gridlines + axis */}
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <g key={f}>
              <line
                x1={PAD.l}
                x2={W - PAD.r}
                y1={y(top * f)}
                y2={y(top * f)}
                stroke="var(--line)"
                strokeWidth={1}
              />
              <text
                x={PAD.l - 8}
                y={y(top * f) + 3}
                textAnchor="end"
                className="fill-[var(--text-3)] font-mono text-[9px]"
              >
                {Math.round(top * f).toLocaleString('en-US')}
              </text>
            </g>
          ))}

          {rows.map((r, i) => {
            let acc = 0;
            return (
              <g key={r.day} onMouseEnter={() => setHover(i)}>
                <rect
                  x={x(i) - (iw / rows.length) / 2}
                  y={PAD.t}
                  width={iw / rows.length}
                  height={ih}
                  fill="transparent"
                />
                {active.map((s) => {
                  const v = r[s.key];
                  const h = (v / top) * ih;
                  const yy = PAD.t + ih - acc - h;
                  acc += h;
                  return (
                    <rect
                      key={s.key}
                      x={x(i) - bw / 2}
                      y={yy}
                      width={bw}
                      height={Math.max(0, h)}
                      rx={2}
                      fill={`var(${s.varName})`}
                      opacity={hover === null || hover === i ? 1 : 0.45}
                    />
                  );
                })}
                <text
                  x={x(i)}
                  y={height - 8}
                  textAnchor="middle"
                  className="fill-[var(--text-3)] font-mono text-[9px]"
                >
                  {r.day.slice(5)}
                </text>
              </g>
            );
          })}
        </svg>

        {hoveredRow ? (
          <div
            className="pointer-events-none absolute right-3 top-2 rounded-sm border border-line bg-surface-2 px-3 py-2 text-11 shadow-lg"
            role="status"
          >
            <div className="mb-1 font-mono text-text-3">{hoveredRow.day}</div>
            {active.map((s) => (
              <div key={s.key} className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-2 flex-none rounded-[2px]"
                  style={{ background: `var(${s.varName})` }}
                />
                <span className="text-text-2">{s.label}</span>
                <span className="ml-auto font-mono tabular">{usd(hoveredRow[s.key])}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        {SERIES.map((s) => {
          const off = hidden.has(s.key);
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => toggle(s.key)}
              aria-pressed={!off}
              className={cn(
                'inline-flex items-center gap-2 text-11 font-medium transition-opacity duration-fast ease-out',
                off ? 'text-text-3 opacity-50' : 'text-text-2',
              )}
            >
              <span
                aria-hidden="true"
                className="size-2 flex-none rounded-[2px]"
                style={{ background: `var(${s.varName})` }}
              />
              {s.label}
            </button>
          );
        })}
        <span className="ml-auto text-11 text-text-3">Click a series to isolate it</span>
      </div>
    </div>
  );
}
