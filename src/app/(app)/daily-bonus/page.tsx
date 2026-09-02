import type { Metadata } from 'next';
import { Clock, Flame, Gift, Sparkles } from 'lucide-react';

import { clock, nf } from '@/lib/format';
import { StatCard } from '@/components/ui/StatCard';
import { PageHeader } from '@/components/shell/PageHeader';
import { AdBanner, AdRail, AdUnit } from '@/components/ads/AdUnit';
import { DailyLadder } from '@/components/pages/daily/DailyLadder';
import { getDailyState } from '@/server/earn/daily';
import { requireUser } from '@/server/session';

export const metadata: Metadata = { title: 'Daily bonus' };
export const dynamic = 'force-dynamic';

export default async function DailyBonusPage() {
  const claims = await requireUser();
  const state = await getDailyState(claims.uid);

  const today = state.steps[state.current];
  const last = state.steps[state.steps.length - 1];

  return (
    <>
      <AdUnit placement="daily.top" className="mb-4" />

      <PageHeader title="Daily bonus" sub={`${state.steps.length} days, compounding`} />

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Current streak"
          value={nf(state.streakDays)}
          unit="days"
          icon={Flame}
          sub={state.streakDays ? 'keep it going' : 'claim today to start one'}
        />
        <StatCard
          label="Today pays"
          value={nf(today?.tokens ?? 0)}
          unit="tokens"
          icon={Gift}
          sub={`+${today?.exp ?? 0} exp · +${today?.bonus ?? 0}% earning bonus`}
        />
        <StatCard
          label={state.claimable ? 'Ready now' : 'Next claim in'}
          value={state.claimable ? 'Claim' : clock(state.secondsRemaining, true)}
          icon={Clock}
          sub={state.claimable ? 'the button is live below' : 'the ladder does not reset yet'}
        />
        <StatCard
          label={`Day ${state.steps.length} pays`}
          value={nf(last?.tokens ?? 0)}
          unit="tokens"
          icon={Sparkles}
          sub={`and locks in +${last?.bonus ?? 0}% on every claim`}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <DailyLadder initialState={state} />
        </div>
        <aside className="flex min-w-0 flex-col gap-5 pt-5">
          <AdRail placement="daily.rail" />
        </aside>
      </div>

      <AdBanner placement="daily.bottom" />
    </>
  );
}
