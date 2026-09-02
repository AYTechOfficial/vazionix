import type { Metadata } from 'next';
import { CheckCircle2, Coins, Sparkles, Target } from 'lucide-react';

import { compact, nf } from '@/lib/format';
import { StatCard } from '@/components/ui/StatCard';
import { PageHeader } from '@/components/shell/PageHeader';
import { AdBanner, AdRail, AdUnit } from '@/components/ads/AdUnit';
import { ChallengeGrid } from '@/components/pages/challenges/ChallengeGrid';
import { listChallenges } from '@/server/earn/daily';
import { requireUser } from '@/server/session';

export const metadata: Metadata = { title: 'Challenges' };
export const dynamic = 'force-dynamic';

export default async function ChallengesPage() {
  const claims = await requireUser();
  const challenges = await listChallenges(claims.uid);

  const ready = challenges.filter((c) => c.claimable);
  const open = challenges.filter((c) => !c.claimed);
  const totalTokens = open.reduce((sum, c) => sum + c.tokens, 0);
  const totalExp = open.reduce((sum, c) => sum + c.exp, 0);

  return (
    <>
      <AdUnit placement="challenges.top" className="mb-4" />

      <PageHeader title="Challenges" sub="Quests with token and experience rewards" />

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Open challenges" value={nf(open.length)} icon={Target} sub="not yet claimed" />
        <StatCard
          label="Ready to claim"
          value={nf(ready.length)}
          icon={CheckCircle2}
          sub="completed, awaiting your claim"
        />
        <StatCard
          label="Reward outstanding"
          value={compact(totalTokens)}
          unit="tokens"
          icon={Coins}
          sub="if you finish every open quest"
        />
        <StatCard label="Experience outstanding" value={nf(totalExp)} unit="exp" icon={Sparkles} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <ChallengeGrid initial={challenges} />
        </div>
        <aside className="flex min-w-0 flex-col gap-5 pt-5">
          <AdRail placement="challenges.rail" />
        </aside>
      </div>

      <AdBanner placement="challenges.bottom" />
    </>
  );
}
