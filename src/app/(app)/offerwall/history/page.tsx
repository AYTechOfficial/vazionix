import type { Metadata } from 'next';
import { CheckCircle2, Clock, Coins, XCircle } from 'lucide-react';

import { nf } from '@/lib/format';
import { Alert } from '@/components/ui/Alert';
import { Card, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { PageHeader } from '@/components/shell/PageHeader';
import { AdBanner, AdUnit } from '@/components/ads/AdUnit';
import { OfferHistoryTable } from '@/components/pages/offerwall/OfferHistoryTable';
import { listConversions } from '@/server/earn/offerwall';
import { requireUser } from '@/server/session';

export const metadata: Metadata = { title: 'Offerwall history' };
export const dynamic = 'force-dynamic';

export default async function OfferwallHistoryPage() {
  const claims = await requireUser();
  const rows = await listConversions(claims.uid, 100);

  const approved = rows.filter((o) => o.status === 'Approved');
  const pending = rows.filter((o) => o.status === 'Pending');
  const rejected = rows.filter((o) => o.status === 'Rejected');
  const credited = approved.reduce((sum, o) => sum + o.reward, 0);

  return (
    <>
      <AdUnit placement="offerwall.top" className="mb-4" />

      <PageHeader title="Offerwall history" sub="Every conversion and its credit status" />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Credited"
          value={nf(credited)}
          unit="tokens"
          icon={Coins}
          sub={`${approved.length} approved conversion${approved.length === 1 ? '' : 's'}`}
        />
        <StatCard
          label="Pending"
          value={nf(pending.reduce((sum, o) => sum + o.reward, 0))}
          unit="tokens"
          icon={Clock}
          sub={`${pending.length} awaiting advertiser verification`}
        />
        <StatCard label="Approved" value={nf(approved.length)} icon={CheckCircle2} sub="lifetime" />
        <StatCard
          label="Rejected"
          value={nf(rejected.length)}
          icon={XCircle}
          sub="advertiser did not verify the action"
        />
      </div>

      {pending.length ? (
        <Alert tone="info" className="mt-5">
          {pending.length} conversion{pending.length === 1 ? ' is' : 's are'} still settling. Providers post
          back once the advertiser verifies the action — usually minutes, occasionally up to 12 hours. If one
          is older than that, open a ticket with the conversion id and support can chase it.
        </Alert>
      ) : null}

      <Card as="section" className="mt-5">
        <CardHead>
          <div className="min-w-0">
            <CardTitle>Conversions</CardTitle>
            <CardSub>Newest first · click any column to re-sort</CardSub>
          </div>
        </CardHead>
        <OfferHistoryTable rows={rows} />
      </Card>

      <AdBanner placement="offerwall.bottom" />
    </>
  );
}
