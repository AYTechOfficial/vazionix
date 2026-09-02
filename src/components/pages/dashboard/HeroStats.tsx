'use client';

import * as React from 'react';
import { Coins, TrendingUp, Zap } from 'lucide-react';

import { tokens } from '@/lib/format';
import { ButtonLink } from '@/components/ui/Button';
import { Delta, StatCard } from '@/components/ui/StatCard';
import { ProgressBar } from '@/components/ui/Progress';
import { Sparkline } from '@/components/charts/Sparkline';
import { useSession } from '@/components/providers/SessionProvider';
import { useTokenValue } from '@/components/providers/RatesProvider';

/* ============================================================================
   DASHBOARD HERO ROW
   ----------------------------------------------------------------------------
   The balance carries its unit and its fiat estimate and owns the only two
   actions that matter. "This week" carries a real week-over-week delta computed
   from the ledger. The bonus explains where it came from and what raises it.

   All three read from the session provider, so a claim on any page moves these
   numbers without a refetch.
   ========================================================================== */

export interface HeroStatsProps {
  weekTokens: number;
  previousWeekTokens: number;
  /** Daily totals for the last fortnight, for the sparkline. */
  trend: number[];
  streakTarget: number;
}

export function HeroStats({ weekTokens, previousWeekTokens, trend, streakTarget }: HeroStatsProps) {
  const { balance, lockedBalance, currency, profile } = useSession();
  const valueIn = useTokenValue();

  /* A zero baseline cannot produce a percentage. Showing "+∞%" or "+0%" would
     both be lies, so the delta is simply omitted for a first week. */
  const delta = previousWeekTokens > 0 ? ((weekTokens - previousWeekTokens) / previousWeekTokens) * 100 : null;

  const streak = profile?.streak ?? 0;
  const bonus = profile?.earningBonus ?? 0;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <StatCard
        hero
        label="Available balance"
        hint="Estimated — varies with market price"
        value={tokens(balance)}
        unit="tokens"
        sub={
          lockedBalance > 0
            ? `≈ ${valueIn(balance, currency)} ${currency} · ${tokens(lockedBalance)} locked in a payout`
            : `≈ ${valueIn(balance, currency)} ${currency}`
        }
        icon={Coins}
      >
        <div className="mt-4 flex items-center gap-2">
          <ButtonLink href="/withdraw" variant="primary" size="sm">
            Withdraw
          </ButtonLink>
          <ButtonLink href="/transactions" variant="ghost" size="sm">
            History
          </ButtonLink>
        </div>
      </StatCard>

      <StatCard
        label="Earned this week"
        value={tokens(weekTokens)}
        unit="tokens"
        sub={
          delta === null ? (
            'your first week — no comparison yet'
          ) : (
            <Delta value={delta} suffix="vs. previous 7 days" />
          )
        }
        icon={TrendingUp}
      >
        <div className="mt-3">
          <Sparkline values={trend} width={200} height={30} />
        </div>
      </StatCard>

      <StatCard
        label="Earning bonus"
        value={`+${bonus.toFixed(1)}%`}
        sub={`on every claim · from level ${profile?.level ?? 1} and a ${streak}-day streak`}
        icon={Zap}
      >
        <div className="mt-4">
          <ProgressBar
            gradient
            value={Math.min(streak, streakTarget)}
            max={streakTarget}
            label={`Daily streak: day ${streak} of ${streakTarget}`}
          />
          <p className="mt-1.5 text-11 text-text-3">
            Day {streak} of {streakTarget} — the ladder tops out at day {streakTarget}
          </p>
        </div>
      </StatCard>
    </div>
  );
}
