import type { Metadata } from 'next';
import { Coins, Link2, Sparkles, Timer } from 'lucide-react';

import { compact, countdown, nf } from '@/lib/format';
import { StatCard } from '@/components/ui/StatCard';
import { PageHeader } from '@/components/shell/PageHeader';
import { AdBanner, AdRail, AdUnit } from '@/components/ads/AdUnit';
import { ShortlinkGrid } from '@/components/pages/shortlinks/ShortlinkGrid';
import { LedgerTable } from '@/components/pages/transactions/LedgerTable';
import { listShortlinks } from '@/server/earn/links';
import { listLedger } from '@/server/ledger';
import { requireUser } from '@/server/session';

export const metadata: Metadata = { title: 'Shortlinks' };
export const dynamic = 'force-dynamic';

export default async function ShortlinksPage() {
  const claims = await requireUser();

  const [{ links, totals }, ledger] = await Promise.all([
    listShortlinks(claims.uid),
    listLedger(claims.uid, { limit: 10, source: 'shortlink' }),
  ]);

  return (
    <>
      <AdUnit placement="shortlinks.top" className="mb-4" />

      <PageHeader title="Shortlinks" sub={`${nf(totals.available)} links available now`} />

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Links available"
          value={nf(totals.available)}
          icon={Link2}
          sub="per-link daily caps apply"
        />
        <StatCard
          label="Reward waiting"
          value={compact(totals.reward)}
          unit="tokens"
          icon={Coins}
          sub="if you clear every available link"
        />
        <StatCard
          label="EXP waiting"
          value={nf(totals.exp)}
          unit="exp"
          icon={Sparkles}
          sub="counts toward your level and bonus"
        />
        <StatCard
          label="Caps reset in"
          value={countdown(totals.resetAt)}
          icon={Timer}
          sub="00:00 UTC every day"
        />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          <ShortlinkGrid links={links} />
          <AdUnit placement="shortlinks.native" />
          <LedgerTable
            title="Your shortlink claims"
            initialEntries={ledger.entries}
            initialCursor={ledger.cursor}
            source="shortlink"
            emptyMessage="No shortlink claims yet."
          />
        </div>

        <aside className="flex min-w-0 flex-col gap-5">
          <AdRail placement="shortlinks.rail" />
        </aside>
      </div>

      <AdBanner placement="shortlinks.bottom" />
    </>
  );
}
