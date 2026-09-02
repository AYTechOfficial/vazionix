import type { Metadata } from 'next';
import { Clock, Coins, Landmark, Lock } from 'lucide-react';

import { nf, tokens, usd } from '@/lib/format';
import { Alert } from '@/components/ui/Alert';
import { StatCard } from '@/components/ui/StatCard';
import { PageHeader } from '@/components/shell/PageHeader';
import { AdRail, AdUnit } from '@/components/ads/AdUnit';
import { WithdrawPanel } from '@/components/pages/withdraw/WithdrawPanel';
import { getEconomy, getPayoutRails, getRates, getSiteConfig } from '@/server/config';
import { requireUser } from '@/server/session';
import { getProfile } from '@/server/users';
import { listAddresses, listWithdrawals } from '@/server/withdraw';

export const metadata: Metadata = { title: 'Withdraw' };
export const dynamic = 'force-dynamic';

/* ============================================================================
   WITHDRAW
   ----------------------------------------------------------------------------
   THE ONE PLACEMENT RULE THAT SURVIVES: nothing renders between a withdrawal
   amount field and its payout selector. This page still carries paid units —
   above the page header, in the right rail beside the history, and below the
   entire transaction card — but never interleaved with the controls that move a
   user's money. A misclick there is a support ticket and a chargeback, which
   costs more than the impression earns.

   Overlay formats are blocked on this route entirely by `overlayBlockedRoutes` in
   the ad behaviour config, so no popunder or interstitial can fire mid-payout.
   ========================================================================== */

export default async function WithdrawPage() {
  const claims = await requireUser();

  const [profile, rails, addresses, history, economy, rates, site] = await Promise.all([
    getProfile(claims.uid, claims.emailVerified),
    getPayoutRails(),
    listAddresses(claims.uid),
    listWithdrawals(claims.uid, 25),
    getEconomy(),
    getRates(),
    getSiteConfig(),
  ]);

  const balance = profile?.balance ?? 0;
  const locked = profile?.lockedBalance ?? 0;
  const inFlight = history.filter((w) =>
    ['Pending', 'HeldForReview', 'Processing'].includes(w.status),
  );

  return (
    <>
      <AdUnit placement="withdraw.top" className="mb-4" />

      <PageHeader title="Withdraw" sub="Every fee, minimum and arrival time shown before you confirm" />

      {!site.withdrawalsOpen ? (
        <Alert tone="warning" className="mb-5">
          Withdrawals are paused right now. Your balance is safe and nothing is queued — this page will accept
          requests again as soon as the pause lifts.
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Available to withdraw"
          value={tokens(balance)}
          unit="tokens"
          icon={Coins}
          sub={`≈ ${usd(balance * rates.usdPerToken)} at today's rate`}
        />
        <StatCard
          label="Locked in payouts"
          value={tokens(locked)}
          unit="tokens"
          icon={Lock}
          sub={
            inFlight.length
              ? `${inFlight.length} withdrawal${inFlight.length === 1 ? '' : 's'} in flight`
              : 'nothing queued'
          }
        />
        <StatCard
          label="Payout options"
          value={nf(rails.length)}
          icon={Landmark}
          sub={`${new Set(rails.map((r) => r.coin)).size} assets across ${new Set(rails.map((r) => r.rail)).size} rails`}
        />
        <StatCard
          label="Daily limit"
          value={nf(economy.withdraw.dailyCount)}
          unit="requests"
          icon={Clock}
          sub="resets at 00:00 UTC"
        />
      </div>

      <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <WithdrawPanel
            rails={rails}
            addresses={addresses}
            history={history}
            minBalanceTokens={economy.withdraw.minBalanceTokens}
            emailVerified={
              economy.withdraw.requireEmailVerified ? claims.emailVerified : true
            }
          />
        </div>

        <aside className="flex min-w-0 flex-col gap-5">
          <AdRail placement="withdraw.rail" />
        </aside>
      </div>
    </>
  );
}
