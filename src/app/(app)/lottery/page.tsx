import type { Metadata } from 'next';
import { Calendar, Coins, Ticket, Trophy } from 'lucide-react';

import { compact, countdown, nf } from '@/lib/format';
import { StatCard } from '@/components/ui/StatCard';
import { PageHeader } from '@/components/shell/PageHeader';
import { AdBanner, AdRail, AdUnit } from '@/components/ads/AdUnit';
import { LotteryPanel } from '@/components/pages/lottery/LotteryPanel';
import { getLotteryState } from '@/server/earn/lottery';
import { requireUser } from '@/server/session';

export const metadata: Metadata = { title: 'Lottery' };
export const dynamic = 'force-dynamic';

export default async function LotteryPage() {
  const claims = await requireUser();
  const state = await getLotteryState(claims.uid);

  const pending = state.myTickets.filter((t) => t.status === 'Pending').length;
  const perWinner = state.winnersPerDraw ? Math.floor(state.prizePool / state.winnersPerDraw) : 0;

  return (
    <>
      <AdUnit placement="lottery.top" className="mb-4" />

      <PageHeader
        title="Lottery"
        sub={`Round ${state.round} · draw in ${countdown(state.drawsAt)}`}
      />

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Prize pool"
          value={compact(state.prizePool)}
          unit="tokens"
          icon={Coins}
          sub={`${nf(perWinner)} tokens per winner across ${state.winnersPerDraw}`}
        />
        <StatCard
          label="Your tickets"
          value={nf(pending)}
          icon={Ticket}
          sub={`of ${nf(state.totalTickets)} in this round`}
        />
        <StatCard
          label="Winners per draw"
          value={nf(state.winnersPerDraw)}
          icon={Trophy}
          sub="drawn from a published random seed"
        />
        <StatCard
          label="Next draw"
          value={countdown(state.drawsAt)}
          icon={Calendar}
          sub="the seed is published with the result"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <LotteryPanel initialState={state} />
        </div>
        <aside className="flex min-w-0 flex-col gap-5 pt-5">
          <AdRail placement="lottery.rail" />
        </aside>
      </div>

      <AdBanner placement="lottery.bottom" />
    </>
  );
}
