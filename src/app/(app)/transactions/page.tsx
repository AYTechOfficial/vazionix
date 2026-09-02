import type { Metadata } from 'next';
import { ArrowDownRight, ArrowUpRight, Coins, Receipt } from 'lucide-react';

import { compact, tokens, usd } from '@/lib/format';
import { StatCard } from '@/components/ui/StatCard';
import { PageHeader } from '@/components/shell/PageHeader';
import { AdBanner, AdUnit } from '@/components/ads/AdUnit';
import { LedgerTable } from '@/components/pages/transactions/LedgerTable';
import { WithdrawHistory } from '@/components/pages/withdraw/WithdrawHistory';
import { getRates } from '@/server/config';
import { listLedger } from '@/server/ledger';
import { requireUser } from '@/server/session';
import { getProfile } from '@/server/users';
import { listWithdrawals } from '@/server/withdraw';

export const metadata: Metadata = { title: 'Transactions' };
export const dynamic = 'force-dynamic';

/* ============================================================================
   TRANSACTIONS
   ----------------------------------------------------------------------------
   The complete ledger for the account: every credit and every debit, cursor-paged
   from `/users/{uid}/claims`, plus the withdrawal records those debits fund.

   Credits and debits share one table on purpose. A user checking "where did my
   balance go" should not have to reconcile two lists — the signed amount column
   answers it in one read.
   ========================================================================== */

export default async function TransactionsPage() {
  const claims = await requireUser();

  const [ledger, withdrawals, profile, rates] = await Promise.all([
    listLedger(claims.uid, { limit: 25 }),
    listWithdrawals(claims.uid, 25),
    getProfile(claims.uid, claims.emailVerified),
    getRates(),
  ]);

  const credited = ledger.entries.filter((e) => e.amount > 0).reduce((sum, e) => sum + e.amount, 0);
  const debited = ledger.entries.filter((e) => e.amount < 0).reduce((sum, e) => sum + Math.abs(e.amount), 0);
  const completed = withdrawals.filter((w) => w.status === 'Completed');

  return (
    <>
      <AdUnit placement="transactions.top" className="mb-4" />

      <PageHeader
        title="Transactions"
        sub="Every credit and debit on your account, newest first"
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Current balance"
          value={tokens(profile?.balance ?? 0)}
          unit="tokens"
          icon={Coins}
          sub={`≈ ${usd((profile?.balance ?? 0) * rates.usdPerToken)}`}
        />
        <StatCard
          label="Lifetime earned"
          value={compact(profile?.totalEarned ?? 0)}
          unit="tokens"
          icon={ArrowUpRight}
          sub={`≈ ${usd(profile?.totalEarnedUsd ?? 0)} at today's rate`}
        />
        <StatCard
          label="Credited on this page"
          value={compact(credited)}
          unit="tokens"
          icon={Receipt}
          sub={`across ${ledger.entries.filter((e) => e.amount > 0).length} rows`}
        />
        <StatCard
          label="Withdrawn"
          value={compact(debited)}
          unit="tokens"
          icon={ArrowDownRight}
          sub={`${completed.length} completed payout${completed.length === 1 ? '' : 's'}`}
        />
      </div>

      <div className="mt-5 flex flex-col gap-5">
        <LedgerTable
          title="Full ledger"
          initialEntries={ledger.entries}
          initialCursor={ledger.cursor}
          maxHeight={640}
        />

        {/* After the first block of rows, in the reading order rather than
            interrupting it. */}
        <AdUnit placement="transactions.midTable" />

        <WithdrawHistory rows={withdrawals} />
      </div>

      <AdBanner placement="transactions.bottom" />
    </>
  );
}
