import type { Metadata } from 'next';
import { Coins, Trophy, Users } from 'lucide-react';

import { compact, nf } from '@/lib/format';
import { Alert } from '@/components/ui/Alert';
import { StatCard } from '@/components/ui/StatCard';
import { PageHeader } from '@/components/shell/PageHeader';
import { AdBanner, AdRail, AdUnit } from '@/components/ads/AdUnit';
import { Boards } from '@/components/pages/leaderboard/Boards';
import { ResetCountdown } from '@/components/pages/leaderboard/ResetCountdown';
import { getEconomy } from '@/server/config';
import { getAllLeaderboards, leaderboardResetsAt, LEADERBOARD_KEYS } from '@/server/social';
import { requireUser } from '@/server/session';
import { getProfile } from '@/server/users';

export const metadata: Metadata = { title: 'Leaderboard' };
export const dynamic = 'force-dynamic';

/* ============================================================================
   LEADERBOARD
   ----------------------------------------------------------------------------
   Five contests, reset weekly, scored by the ledger as credits land. The prize
   pool is the configured pool per board multiplied by the number of boards, not
   a sum of what the current rows happen to hold — a board with three players has
   the same pool as a board with a hundred, and reporting otherwise would make the
   number shrink as players leave.
   ========================================================================== */

export default async function LeaderboardPage() {
  const claims = await requireUser();

  const [boards, profile, economy] = await Promise.all([
    getAllLeaderboards(claims.uid),
    getProfile(claims.uid, claims.emailVerified),
    getEconomy(),
  ]);

  const all = LEADERBOARD_KEYS.map((key) => boards[key]);
  const totalPool = economy.leaderboard.prizePoolPerBoard * LEADERBOARD_KEYS.length;
  const contenders = all.reduce((sum, b) => sum + b.rows.length, 0);

  const ranks = all.map((b) => b.you.rank).filter((r): r is number => typeof r === 'number');
  const bestRank = ranks.length ? Math.min(...ranks) : null;
  const bestBoard = bestRank
    ? all.find((b) => b.you.rank === bestRank)
    : undefined;

  return (
    <>
      <AdUnit placement="leaderboard.top" className="mb-4" />

      <PageHeader
        title="Leaderboard"
        sub="Five contests, reset every Sunday at 00:00 UTC"
        actions={<ResetCountdown resetsAt={leaderboardResetsAt()} />}
      />

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <StatCard
          label="Prize pool this reset"
          value={compact(totalPool)}
          unit="tokens"
          icon={Coins}
          sub={`${compact(economy.leaderboard.prizePoolPerBoard)} per board, across five boards`}
        />
        <StatCard
          label="Your best rank"
          value={bestRank ? `#${bestRank}` : 'Unranked'}
          icon={Trophy}
          sub={
            bestBoard
              ? `${bestBoard.metric.toLowerCase()} · ${nf(bestBoard.you.value)} ${bestBoard.unit}`
              : 'earn on any surface to enter a board'
          }
        />
        <StatCard
          label="Ranked players"
          value={nf(contenders)}
          icon={Users}
          sub="across all five boards this period"
        />
      </div>

      <Alert tone="info" className="mt-5">
        Prizes are credited automatically at the reset, straight into your balance with a matching row in
        Transactions. You do not need to claim them, and a rank that moves after the reset does not change what
        you were paid.
      </Alert>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <Boards
            boards={boards}
            viewerUid={claims.uid}
            viewerUsername={profile?.username ?? 'you'}
            viewerCountry={profile?.countryCode ?? 'XX'}
          />
        </div>
        <aside className="flex min-w-0 flex-col gap-5">
          <AdRail placement="leaderboard.rail" />
        </aside>
      </div>

      <AdBanner placement="leaderboard.bottom" />
    </>
  );
}
