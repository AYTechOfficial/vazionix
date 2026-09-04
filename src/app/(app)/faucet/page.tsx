import type { Metadata } from 'next';
import { Droplet, Flame, Gauge, Timer } from 'lucide-react';

import { nf } from '@/lib/format';
import { StatCard } from '@/components/ui/StatCard';
import { PageHeader } from '@/components/shell/PageHeader';
import { AdBanner, AdRail, AdUnit } from '@/components/ads/AdUnit';
import { FaucetClaim } from '@/components/earn/FaucetClaim';
import { LedgerTable } from '@/components/pages/transactions/LedgerTable';
import { getFaucetState } from '@/server/earn/faucet';
import { listLedger } from '@/server/ledger';
import { requireUser } from '@/server/session';
import { getProfile } from '@/server/users';

export const metadata: Metadata = { title: 'Faucet' };
export const dynamic = 'force-dynamic';

/* ============================================================================
   FAUCET
   ----------------------------------------------------------------------------
   The highest-traffic page in the product, and therefore the densest ad surface:
   a billboard above the header, a leaderboard above the claim card, a rectangle
   under the button that is on screen for the whole cooldown, a half-page and a
   rectangle in the rail, an outstream video beside the timer, a native unit under
   the claim history, and the post-claim rectangle that only renders on success.
   Nine slots, all empty until you fill them from Admin → Ads → Inventory.
   ========================================================================== */

export default async function FaucetPage() {
  const claims = await requireUser();

  const [state, profile, ledger] = await Promise.all([
    getFaucetState(claims.uid),
    getProfile(claims.uid, claims.emailVerified),
    listLedger(claims.uid, { limit: 10, source: 'faucet' }),
  ]);

  const remainingToday = Math.max(0, state.dailyCap - state.claimsToday);

  return (
    <>
      <AdUnit placement="faucet.top" className="mb-4" />

      <PageHeader
        title="Faucet"
        sub={`Claim ${nf(state.rewardTokens)} tokens every ${Math.round(state.cooldownSeconds / 60)} minutes`}
      />

      <AdBanner placement="faucet.aboveClaim" />

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Reward per claim"
          value={nf(state.rewardTokens)}
          unit="tokens"
          icon={Droplet}
          sub={`+${state.expMax > state.expMin ? `${state.expMin}–${state.expMax}` : state.expMin} exp · +${(profile?.earningBonus ?? 0).toFixed(1)}% bonus applied`}
        />
        <StatCard
          label="Cooldown"
          value={String(Math.round(state.cooldownSeconds / 60))}
          unit="min"
          icon={Timer}
          sub="between claims"
        />
        <StatCard
          label="Happy hour"
          value={state.happyHourActive ? 'Active' : 'Scheduled'}
          icon={Flame}
          sub={`+${state.happyHourBonusPct}% on every claim while it runs`}
        />
        <StatCard
          label="Claims left today"
          value={nf(remainingToday)}
          unit={`of ${nf(state.dailyCap)}`}
          icon={Gauge}
          sub="resets at 00:00 UTC"
        />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          <FaucetClaim initialState={state} />

          {/* On screen for the entire cooldown — the best-viewed box on the site. */}
          <AdUnit placement="faucet.belowClaim" />

          <LedgerTable
            title="Your faucet claims"
            initialEntries={ledger.entries}
            initialCursor={ledger.cursor}
            source="faucet"
            emptyMessage="No faucet claims yet. The button above is the whole feature."
          />

          <AdUnit placement="faucet.native" />
        </div>

        <aside className="flex min-w-0 flex-col gap-5">
          <AdRail placement="faucet.railTop" />
          <AdUnit placement="faucet.video" />
          <AdUnit placement="faucet.railBottom" />
        </aside>
      </div>

      <AdBanner placement="faucet.bottom" />
    </>
  );
}
