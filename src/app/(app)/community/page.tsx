import type { Metadata } from 'next';
import { Coins, Globe2, Trophy, Users } from 'lucide-react';

import { compact, nf, relative } from '@/lib/format';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { CountryChip } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { ButtonLink } from '@/components/ui/Button';
import { StatCard } from '@/components/ui/StatCard';
import { PageHeader } from '@/components/shell/PageHeader';
import { AdBanner, AdUnit } from '@/components/ads/AdUnit';
import { getPayoutTicker, getPlatformStats } from '@/server/stats';
import { getAllLeaderboards } from '@/server/social';
import { requireUser } from '@/server/session';

export const metadata: Metadata = { title: 'Community' };
export const revalidate = 60;

/* ============================================================================
   COMMUNITY
   ----------------------------------------------------------------------------
   Real activity, not a feed. Three things people actually want to see about a
   payouts product: how many are here right now, what has just been paid out, and
   who is winning. All three are live reads.

   Cached for a minute rather than per-request: every visitor sees identical
   numbers, and a page that issues a fresh aggregate query per viewer is the first
   thing to fall over under a traffic spike.
   ========================================================================== */

export default async function CommunityPage() {
  await requireUser();

  const [stats, ticker, boards] = await Promise.all([
    getPlatformStats(),
    getPayoutTicker(20),
    getAllLeaderboards(null),
  ]);

  const topEarners = boards.offerwall.rows.slice(0, 10);

  return (
    <>
      <AdUnit placement="community.top" className="mb-4" />

      <PageHeader title="Community" sub="What is happening across the platform right now" />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Online now"
          value={nf(stats.onlineNow)}
          icon={Users}
          sub="active in the last five minutes"
        />
        <StatCard
          label="Members"
          value={compact(stats.members)}
          icon={Globe2}
          sub={`${nf(stats.membersToday)} joined today`}
        />
        <StatCard
          label="Claims today"
          value={compact(stats.claimsToday)}
          icon={Coins}
          sub={`${compact(stats.claimsAllTime)} all time`}
        />
        <StatCard
          label="Payouts today"
          value={nf(stats.withdrawalsToday)}
          icon={Trophy}
          sub={`${nf(stats.withdrawalsAllTime)} all time`}
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card as="section">
          <CardHead>
            <div className="min-w-0">
              <CardTitle>Latest payouts</CardTitle>
              <CardSub>Completed withdrawals, newest first</CardSub>
            </div>
          </CardHead>

          {ticker.length === 0 ? (
            <CardBody>
              <EmptyState
                art="success"
                title="No payouts yet"
                body="Completed withdrawals appear here as they settle. Yours could be the first."
                action={
                  <ButtonLink href="/withdraw" variant="primary" size="sm">
                    Withdraw
                  </ButtonLink>
                }
              />
            </CardBody>
          ) : (
            <ul className="flex max-h-[420px] flex-col overflow-y-auto">
              {ticker.map((row, index) => (
                <li
                  key={`${row.username}-${row.at}-${index}`}
                  className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0"
                >
                  <CountryChip code={row.countryCode} />
                  <span className="min-w-0 flex-1 truncate text-13 text-text-2">{row.username}</span>
                  <span className="font-mono text-13 font-semibold tabular text-mint">
                    {row.amount} {row.coin}
                  </span>
                  <span className="w-[70px] text-right text-11 text-text-3">{relative(row.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card as="section">
          <CardHead>
            <div className="min-w-0">
              <CardTitle>Top of the offerwall board</CardTitle>
              <CardSub>This period, resets Sunday 00:00 UTC</CardSub>
            </div>
            <ButtonLink href="/leaderboard" variant="ghost" size="sm">
              All boards
            </ButtonLink>
          </CardHead>

          {topEarners.length === 0 ? (
            <CardBody>
              <EmptyState
                art="success"
                title="Board is empty this period"
                body="It resets weekly. The first completed offer takes first place."
                action={
                  <ButtonLink href="/offerwall" variant="primary" size="sm">
                    Open the offerwall
                  </ButtonLink>
                }
              />
            </CardBody>
          ) : (
            <ul className="flex flex-col">
              {topEarners.map((row) => (
                <li
                  key={row.uid}
                  className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0"
                >
                  <span className="grid size-[22px] flex-none place-items-center rounded-sm bg-surface-3 font-mono text-11 font-semibold tabular text-text-2">
                    {row.rank}
                  </span>
                  <CountryChip code={row.countryCode} />
                  <span className="min-w-0 flex-1 truncate text-13 text-text-2">{row.username}</span>
                  <span className="font-mono text-13 tabular text-text">{nf(row.value)}</span>
                  {row.prize ? (
                    <span className="w-[80px] text-right font-mono text-12 tabular text-mint">
                      {compact(row.prize)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-5">
        <AdUnit placement="community.inFeed" />
      </div>

      <AdBanner placement="community.bottom" />
    </>
  );
}
