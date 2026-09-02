import type { Metadata } from 'next';
import { ArrowRight, Layers, Star, Timer, TrendingUp } from 'lucide-react';

import { compact, nf } from '@/lib/format';
import { ButtonLink } from '@/components/ui/Button';
import { StatCard } from '@/components/ui/StatCard';
import { PageHeader } from '@/components/shell/PageHeader';
import { AdBanner, AdRail, AdUnit } from '@/components/ads/AdUnit';
import { OfferProviders } from '@/components/pages/offerwall/OfferProviders';
import { LedgerTable } from '@/components/pages/transactions/LedgerTable';
import { listConversions, listOfferProviders } from '@/server/earn/offerwall';
import { listLedger } from '@/server/ledger';
import { requireUser } from '@/server/session';
import { getProfile } from '@/server/users';

export const metadata: Metadata = { title: 'Offerwall' };
export const dynamic = 'force-dynamic';

export default async function OfferwallPage() {
  const claims = await requireUser();
  const profile = await getProfile(claims.uid, claims.emailVerified);

  const [providers, conversions, ledger] = await Promise.all([
    listOfferProviders(
      profile
        ? { uid: profile.uid, username: profile.username, countryCode: profile.countryCode }
        : null,
    ),
    listConversions(claims.uid, 10),
    listLedger(claims.uid, { limit: 10, source: 'offerwall' }),
  ]);

  const live = providers.filter((p) => p.enabled && p.url);
  const avgRating = live.length ? live.reduce((sum, p) => sum + p.rating, 0) / live.length : 0;
  const approved = conversions.filter((c) => c.status === 'Approved');
  const best = approved.length ? Math.max(...approved.map((c) => c.reward)) : 0;

  return (
    <>
      <AdUnit placement="offerwall.top" className="mb-4" />

      <PageHeader
        title="Offerwall"
        sub={`${nf(live.length)} provider${live.length === 1 ? '' : 's'} connected`}
        actions={
          <ButtonLink href="/offerwall/history" variant="secondary">
            Conversion history
            <ArrowRight />
          </ButtonLink>
        }
      />

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Providers live"
          value={nf(live.length)}
          icon={Layers}
          sub="all paying into the same balance"
        />
        <StatCard
          label="Your biggest credit"
          value={best ? compact(best) : '—'}
          unit={best ? 'tokens' : undefined}
          icon={TrendingUp}
          sub={best ? 'from a completed offer' : 'complete an offer to set one'}
        />
        <StatCard
          label="Average provider rating"
          value={avgRating ? avgRating.toFixed(1) : '—'}
          unit={avgRating ? '/ 5' : undefined}
          icon={Star}
          sub="rated by credit reliability"
        />
        <StatCard
          label="Typical credit time"
          value="< 12"
          unit="hours"
          icon={Timer}
          sub="most settle in minutes"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <OfferProviders providers={providers} />
          <AdUnit placement="offerwall.native" className="mt-5" />
          <LedgerTable
            title="Your offerwall credits"
            initialEntries={ledger.entries}
            initialCursor={ledger.cursor}
            source="offerwall"
            emptyMessage="No offerwall credits yet. Conversions land here as providers confirm them."
            card
          />
        </div>
        <aside className="flex min-w-0 flex-col gap-5 pt-5">
          <AdRail placement="offerwall.rail" />
        </aside>
      </div>

      <AdBanner placement="offerwall.bottom" />
    </>
  );
}
