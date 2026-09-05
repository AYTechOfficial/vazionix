import type { Metadata } from 'next';
import { Award, Coins, Link2, TrendingUp, Users } from 'lucide-react';

import { compact, nf } from '@/lib/format';
import { pct } from '@/lib/utils';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { CountryChip } from '@/components/ui/Avatar';
import { Pill } from '@/components/ui/Pill';
import { ProgressBar } from '@/components/ui/Progress';
import { StatCard } from '@/components/ui/StatCard';
import { Donut } from '@/components/charts/Donut';
import { GeoBubbles } from '@/components/charts/GeoBubbles';
import { PageHeader } from '@/components/shell/PageHeader';
import { AdBanner, AdRail, AdUnit } from '@/components/ads/AdUnit';
import { ShareBlock } from '@/components/pages/referrals/ShareBlock';
import { ReferralTable } from '@/components/pages/referrals/ReferralTable';
import { getReferralSummary, getReferralTiers } from '@/server/social';
import { requireUser } from '@/server/session';
import type { ReferralRow } from '@/lib/models';

export const metadata: Metadata = { title: 'Referrals' };
export const dynamic = 'force-dynamic';

/* ============================================================================
   REFERRALS
   ----------------------------------------------------------------------------
   The tree lives at `/referrals/{uid}/list/{referredUid}` — one document per
   edge, keyed by the referred user's uid, so an edge is unique by construction
   and nobody can be referred twice.

   TOTAL and QUALIFIED are kept visibly separate. Total is anyone who signed up
   through the link; qualified is those who reached the qualifying level, and only
   qualified referrals move a tier. Conflating the two is how a user comes to
   believe they are owed a rate they have not earned.

   The activity donut splits the network by last-seen recency, which is data we
   actually hold. There is no acquisition-channel chart, because we do not record
   acquisition channel, and a chart that invents one is worse than no chart.
   ========================================================================== */

const STATUS_TONE: Record<ReferralRow['status'], 'mint' | 'warning' | 'neutral'> = {
  active: 'mint',
  idle: 'warning',
  dormant: 'neutral',
};

const STATUS_LABEL: Record<ReferralRow['status'], string> = {
  active: 'Active',
  idle: 'Idle',
  dormant: 'Dormant',
};

export default async function ReferralsPage() {
  const claims = await requireUser();
  const [summary, tiers] = await Promise.all([getReferralSummary(claims.uid), getReferralTiers()]);

  const activity = [
    { label: 'Active', value: summary.rows.filter((r) => r.status === 'active').length, color: 'var(--mint)' },
    { label: 'Idle', value: summary.rows.filter((r) => r.status === 'idle').length, color: 'var(--warning)' },
    { label: 'Dormant', value: summary.rows.filter((r) => r.status === 'dormant').length, color: 'var(--violet)' },
  ];


  return (
    <>
      <AdUnit placement="referrals.top" className="mb-4" />

      <PageHeader
        title="Referrals"
        sub="Earn a lifetime share of what your invites earn"
        actions={
          <Pill tone="violet" size="lg" icon={Award}>
            {summary.tier} · {summary.rate}% commission
          </Pill>
        }
      />

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total referrals"
          value={nf(summary.total)}
          icon={Users}
          sub={`${nf(summary.qualified)} qualified toward your tier`}
        />
        <StatCard
          label="Active this week"
          value={nf(summary.activeThisWeek)}
          icon={TrendingUp}
          sub={
            summary.total
              ? `${Math.round((summary.activeThisWeek / summary.total) * 100)}% of your network`
              : 'nobody yet'
          }
        />
        <StatCard
          label="Commission earned"
          value={compact(summary.commissionEarned)}
          unit="tokens"
          icon={Coins}
          sub="credited as they earn, not on a delay"
        />
        <StatCard
          label="Link clicks"
          value={nf(summary.clicks)}
          icon={Link2}
          sub={
            summary.clicks
              ? `${Math.round((summary.signups / Math.max(1, summary.clicks)) * 100)}% converted to signups`
              : 'share your link to start counting'
          }
        />
      </div>

      <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <ShareBlock link={summary.link} code={summary.code} commissionRate={summary.rate} />

          <Card as="section">
            <CardHead>
              <div className="min-w-0">
                <CardTitle>Commission tier</CardTitle>
                <CardSub>A referral counts once they reach level 1</CardSub>
              </div>
              {summary.nextTier ? (
                <Pill tone="mint">
                  {summary.toNextTier} more for {summary.nextTier.name}
                </Pill>
              ) : (
                <Pill tone="mint">Top tier reached</Pill>
              )}
            </CardHead>
            <CardBody>
              {summary.nextTier ? (
                <ProgressBar
                  size="lg"
                  gradient
                  value={summary.qualified}
                  max={summary.nextTier.at}
                  label={`Progress to ${summary.nextTier.name}`}
                />
              ) : null}

              <ol className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {tiers.map((tier) => {
                  const reached = summary.qualified >= tier.at;
                  const current = tier.name === summary.tier;
                  return (
                    <li
                      key={tier.name}
                      aria-current={current ? 'step' : undefined}
                      className={[
                        'flex flex-col gap-1 rounded-md border p-4',
                        current
                          ? 'border-mint bg-mint-dim'
                          : reached
                            ? 'border-line-accent bg-surface-1'
                            : 'border-line bg-surface-1 opacity-70',
                      ].join(' ')}
                    >
                      <div className="flex items-center justify-between">
                        <strong className="text-13">{tier.name}</strong>
                        <span className="font-mono text-12 font-semibold tabular text-mint">{tier.rate}%</span>
                      </div>
                      <span className="text-11 text-text-3">
                        {tier.at === 0 ? 'From your first invite' : `${tier.at}+ qualified`}
                      </span>
                      <span className="text-11 leading-[1.45] text-text-2">{tier.perk}</span>
                    </li>
                  );
                })}
              </ol>
            </CardBody>
          </Card>

          <Card as="section">
            <CardHead>
              <div className="min-w-0">
                <CardTitle>Your referrals</CardTitle>
                <CardSub>Click a column to re-sort</CardSub>
              </div>
              <Pill>{summary.rows.length}</Pill>
            </CardHead>
            <ReferralTable rows={summary.rows} rate={summary.rate} />
          </Card>
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <Card as="section">
            <CardHead>
              <div className="min-w-0">
                <CardTitle>Network activity</CardTitle>
                <CardSub>By last-seen recency</CardSub>
              </div>
            </CardHead>
            <CardBody className="flex flex-col items-center gap-5">
              <Donut
                title="Referral network activity"
                slices={activity}
                center={
                  <>
                    <div className="font-mono text-20 font-semibold tabular">{summary.total}</div>
                    <div className="text-[10px] uppercase tracking-wide text-text-3">referrals</div>
                  </>
                }
              />
              <ul className="flex w-full flex-col gap-2">
                {activity.map((slice) => (
                  <li key={slice.label} className="flex items-center gap-2 text-12">
                    <i
                      aria-hidden="true"
                      className="size-2 flex-none rounded-[2px]"
                      style={{ background: slice.color }}
                    />
                    <span className="flex-1 text-text-2">{slice.label}</span>
                    <span className="font-mono tabular text-text">
                      {summary.total ? `${Math.round(pct(slice.value, summary.total))}%` : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          <Card as="section">
            <CardHead>
              <div className="min-w-0">
                <CardTitle>Referrals by country</CardTitle>
                <CardSub>Bubble size = referral count</CardSub>
              </div>
            </CardHead>
            <CardBody>
              {summary.byCountry.length ? (
                <>
                  <GeoBubbles points={summary.byCountry} />
                  <ul className="mt-4 flex flex-wrap gap-2">
                    {summary.byCountry.slice(0, 6).map((g) => (
                      <li key={g.code}>
                        <Pill>
                          <CountryChip code={g.code} name={g.country} className="border-0 bg-transparent" />
                          {compact(g.count)}
                        </Pill>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="py-8 text-center text-12 text-text-3">
                  Country data appears once your first referral signs in.
                </p>
              )}
            </CardBody>
          </Card>

          <AdRail placement="referrals.rail" />
        </aside>
      </div>

      <AdBanner placement="referrals.bottom" />
    </>
  );
}
