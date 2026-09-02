'use client';

import * as React from 'react';
import { Crown, Medal } from 'lucide-react';

import { cn } from '@/lib/utils';
import { compact, nf } from '@/lib/format';
import type { LeaderboardBoard, LeaderboardKey, LeaderboardRow } from '@/lib/models';
import { Card, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { CountryChip } from '@/components/ui/Avatar';
import { DataTable, RankBadge, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { ButtonLink } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';
import { Tabs, TabPanel } from '@/components/ui/Tabs';
import { AdUnit } from '@/components/ads/AdUnit';

/* ============================================================================
   LEADERBOARD BOARDS
   ----------------------------------------------------------------------------
   One board at a time behind real tabs, a podium for the top three, and the
   viewer's own row PINNED to the bottom of the table so their standing is
   visible however far they scroll. The pin only appears when they are not
   already in the visible rows — otherwise the same person shows twice, which
   reads as a bug.

   Scores are written by the ledger on every qualifying credit, so a board that
   is empty means nobody has earned on that surface this period. That is said
   plainly rather than shown as an empty table.
   ========================================================================== */

const TAB_LABELS: Array<{ key: LeaderboardKey; label: string }> = [
  { key: 'offerwall', label: 'Offerwall' },
  { key: 'referral', label: 'Referrals' },
  { key: 'shortlink', label: 'Shortlinks' },
  { key: 'faucet', label: 'Faucet' },
  { key: 'ptc', label: 'PTC' },
];

interface Ranked extends LeaderboardRow {
  isYou: boolean;
}

export function Boards({
  boards,
  viewerUid,
  viewerUsername,
  viewerCountry,
}: {
  boards: Record<LeaderboardKey, LeaderboardBoard>;
  viewerUid: string;
  viewerUsername: string;
  viewerCountry: string;
}) {
  const [tab, setTab] = React.useState<LeaderboardKey>('faucet');
  const board = boards[tab];

  const ranked: Ranked[] = board.rows.map((r) => ({ ...r, isYou: r.uid === viewerUid }));
  const podium = ranked.slice(0, 3);
  const rest = ranked.slice(3);

  const youRow: Ranked | null =
    !ranked.some((r) => r.isYou) && board.you.value > 0
      ? {
          uid: viewerUid,
          username: viewerUsername,
          countryCode: viewerCountry,
          value: board.you.value,
          prize: 0,
          rank: board.you.rank ?? 0,
          isYou: true,
        }
      : null;

  const columns: Array<Column<Ranked>> = [
    {
      id: 'rank',
      header: '#',
      srHeader: 'Rank',
      sortValue: (r) => r.rank,
      cell: (r) => <RankBadge rank={r.rank || null} />,
    },
    {
      id: 'user',
      header: 'Player',
      sortValue: (r) => r.username,
      cell: (r) => (
        <span className="flex items-center gap-2">
          <CountryChip code={r.countryCode} />
          <span className={cn('text-text', r.isYou && 'font-semibold')}>{r.username}</span>
          {r.isYou ? <Pill tone="mint">You</Pill> : null}
        </span>
      ),
    },
    {
      id: 'value',
      header: board.metric,
      numeric: true,
      sortValue: (r) => r.value,
      cell: (r) => `${nf(r.value)}${board.unit ? ` ${board.unit}` : ''}`,
    },
    {
      id: 'prize',
      header: 'Prize',
      numeric: true,
      sortValue: (r) => r.prize,
      cell: (r) =>
        r.prize ? <span className="text-mint">{compact(r.prize)}</span> : <span className="text-text-3">—</span>,
    },
  ];

  return (
    <>
      <Tabs<LeaderboardKey>
        idBase="lb"
        label="Leaderboard category"
        variant="line"
        value={tab}
        onValueChange={setTab}
        items={TAB_LABELS.map((t) => ({ value: t.key, label: t.label }))}
        className="mb-5"
      />

      <TabPanel idBase="lb" value={tab}>
        {board.rows.length === 0 ? (
          <Card as="section">
            <EmptyState
              art="success"
              title="Nobody on this board yet"
              body={`This board resets weekly and scores from ${TAB_LABELS.find((t) => t.key === tab)?.label.toLowerCase()} activity. The first claim of the period takes first place.`}
              action={
                <ButtonLink href="/faucet" variant="primary" size="sm">
                  Start earning
                </ButtonLink>
              }
            />
          </Card>
        ) : (
          <>
            <ol className="grid items-end gap-3 md:grid-cols-[1fr_1.16fr_1fr]">
              {[podium[1], podium[0], podium[2]].map((entry, displayIndex) => {
                if (!entry) return null;
                const place = Math.min(3, Math.max(1, entry.rank)) as 1 | 2 | 3;
                return (
                  <li
                    key={entry.uid}
                    className={cn(
                      'relative rounded-md border border-line bg-surface-1 px-3 pb-4 pt-5 text-center',
                      'transition-transform duration-base ease-out hover:-translate-y-[3px]',
                      place === 1 && 'pt-6',
                    )}
                    style={{
                      background: `radial-gradient(120% 100% at 50% 0%, var(--rank-${place}-glow), transparent 62%), var(--surface-1)`,
                      borderColor: place === 1 ? 'var(--rank-1-line)' : undefined,
                      order: displayIndex,
                    }}
                  >
                    {place === 1 ? (
                      <Crown
                        aria-hidden="true"
                        className="absolute -top-[13px] left-1/2 size-[26px] -translate-x-1/2"
                        style={{ color: 'var(--rank-1)' }}
                        fill="currentColor"
                      />
                    ) : null}
                    <span
                      className="absolute left-2 top-2 grid size-5 place-items-center rounded-[6px] font-mono text-[10px] font-bold"
                      style={{ background: `var(--rank-${place})`, color: `var(--rank-${place}-ink)` }}
                    >
                      {place}
                    </span>

                    <div className="mx-auto flex flex-col items-center gap-2">
                      <Medal aria-hidden="true" className="size-6 text-text-3" />
                      <CountryChip code={entry.countryCode} />
                    </div>
                    <div className="mt-3 text-13 font-semibold">{entry.username}</div>
                    <div className="mt-0.5 font-mono text-16 font-semibold tabular">
                      {nf(entry.value)}
                      {board.unit ? <span className="ml-1 text-11 text-text-3">{board.unit}</span> : null}
                    </div>
                    <div className="mt-3">
                      <Pill tone="mint">{compact(entry.prize)} tokens</Pill>
                    </div>
                  </li>
                );
              })}
            </ol>

            <Card as="section" className="mt-5">
              <CardHead>
                <div className="min-w-0">
                  <CardTitle>{TAB_LABELS.find((t) => t.key === tab)?.label} board</CardTitle>
                  <CardSub>Ranked by {board.metric.toLowerCase()} · prizes credited at reset</CardSub>
                </div>
                <Pill tone={board.you.rank ? 'mint' : 'neutral'}>
                  {board.you.rank ? `You: #${board.you.rank}` : 'You: unranked'}
                </Pill>
              </CardHead>
              <DataTable
                caption={`${tab} leaderboard, ranks 4 and below, with your own position pinned`}
                columns={columns}
                rows={rest}
                getRowKey={(r) => r.uid}
                isYou={(r) => r.isYou}
                pinnedRow={youRow}
                maxHeight={520}
              />
            </Card>

            {/* After the podium and the first block of rows — a real position in
                the reading order rather than an interruption. */}
            <AdUnit placement="leaderboard.midTable" className="mt-5" />
          </>
        )}
      </TabPanel>
    </>
  );
}
