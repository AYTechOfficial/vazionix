'use client';

import * as React from 'react';

import { compact, relative } from '@/lib/format';
import { api } from '@/lib/api';
import type { PayoutTickerRow, PlatformStats } from '@/lib/models';
import { CountryChip } from '@/components/ui/Avatar';
import { useCountUp } from '@/lib/hooks';

/* ============================================================================
   LIVE COUNTERS
   ----------------------------------------------------------------------------
   The homepage numbers, polled from `/api/stats` every 30 seconds. They arrive
   server-rendered, so the first paint carries real values rather than zeros
   ticking up from nothing — a counter that animates from zero on every load is a
   counter nobody believes.

   Polling rather than a Firestore listener: this is an unauthenticated page, and
   opening a client SDK connection for four aggregate numbers would mean either
   world-readable stats documents or an authenticated read the visitor cannot make.
   The API route caches for 60 seconds, so the poll costs nothing at the database.
   ========================================================================== */

const POLL_MS = 30_000;

export function LiveStats({
  initial,
  initialTicker,
}: {
  initial: PlatformStats;
  initialTicker: PayoutTickerRow[];
}) {
  const [stats, setStats] = React.useState(initial);
  const [ticker, setTicker] = React.useState(initialTicker);

  React.useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const next = await api.get<{ stats: PlatformStats; ticker: PayoutTickerRow[] }>('/api/stats');
        if (cancelled) return;
        setStats(next.stats);
        setTicker(next.ticker);
      } catch {
        // A failed poll leaves the last known values on screen, which is better
        // than blanking a headline number because one request lost a race.
      }
    };

    const id = window.setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return (
    <>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Counter label="Members" value={stats.members} />
        <Counter label="Online now" value={stats.onlineNow} live />
        <Counter label="Claims paid" value={stats.claimsAllTime} />
        <Counter label="Payouts sent" value={stats.withdrawalsAllTime} />
      </dl>

      {ticker.length > 0 ? (
        <div className="mt-8">
          <h3 className="text-13 font-semibold text-text-2">Recently paid out</h3>
          <ul className="mt-3 flex flex-col gap-2">
            {ticker.slice(0, 6).map((row, index) => (
              <li
                key={`${row.username}-${row.at}-${index}`}
                className="flex items-center gap-3 rounded-sm border border-line bg-surface-1 px-3 py-2"
              >
                <CountryChip code={row.countryCode} />
                <span className="min-w-0 flex-1 truncate text-13 text-text-2">{row.username}</span>
                <span className="font-mono text-13 tabular text-mint">
                  {row.amount} {row.coin}
                </span>
                <span className="w-[64px] text-right text-11 text-text-3">{relative(row.at)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}

function Counter({ label, value, live = false }: { label: string; value: number; live?: boolean }) {
  const animated = useCountUp(value, 800);

  return (
    <div className="rounded-md border border-line bg-surface-1 p-4">
      <dt className="flex items-center gap-1.5 text-11 uppercase tracking-wide text-text-3">
        {live ? (
          <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-mint" />
        ) : null}
        {label}
      </dt>
      <dd className="mt-1 font-mono text-24 font-semibold tabular text-text max-md:text-20">
        {compact(Math.round(animated))}
      </dd>
    </div>
  );
}
