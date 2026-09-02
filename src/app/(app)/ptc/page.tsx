import type { Metadata } from 'next';
import { Clock, Coins, Megaphone, Timer } from 'lucide-react';

import { compact, dur, nf } from '@/lib/format';
import { StatCard } from '@/components/ui/StatCard';
import { PageHeader } from '@/components/shell/PageHeader';
import { AdBanner, AdRail, AdUnit } from '@/components/ads/AdUnit';
import { PtcWall } from '@/components/pages/ptc/PtcWall';
import { LedgerTable } from '@/components/pages/transactions/LedgerTable';
import { listPtcAds } from '@/server/earn/links';
import { listLedger } from '@/server/ledger';
import { requireUser } from '@/server/session';

export const metadata: Metadata = { title: 'PTC ads' };
export const dynamic = 'force-dynamic';

export default async function PtcPage() {
  const claims = await requireUser();

  const [{ ads, totals }, ledger] = await Promise.all([
    listPtcAds(claims.uid),
    listLedger(claims.uid, { limit: 10, source: 'ptc' }),
  ]);

  const average = totals.available ? Math.round(totals.reward / totals.available) : 0;

  return (
    <>
      <AdUnit placement="ptc.top" className="mb-4" />

      <PageHeader title="PTC ads" sub={`${nf(totals.available)} ads available now`} />

      <AdBanner placement="ptc.top" />

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Ads available"
          value={nf(totals.available)}
          icon={Megaphone}
          sub="refreshed as advertisers buy views"
        />
        <StatCard
          label="Total reward waiting"
          value={compact(totals.reward)}
          unit="tokens"
          icon={Coins}
          sub="if you watch every available ad"
        />
        <StatCard
          label="Time to clear the wall"
          value={dur(totals.seconds)}
          icon={Timer}
          sub="total mandatory view time"
        />
        <StatCard
          label="Average per ad"
          value={nf(average)}
          unit="tokens"
          icon={Clock}
          sub="paid on completion, not on click"
        />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          <PtcWall ads={ads} byType={totals.byType} />
          <AdUnit placement="ptc.native" />
          <LedgerTable
            title="Your PTC views"
            initialEntries={ledger.entries}
            initialCursor={ledger.cursor}
            source="ptc"
            emptyMessage="No views yet. Every completed view is credited here with the exact amount."
          />
        </div>

        <aside className="flex min-w-0 flex-col gap-5">
          <AdRail placement="ptc.rail" />
        </aside>
      </div>

      <AdBanner placement="ptc.bottom" />
    </>
  );
}
