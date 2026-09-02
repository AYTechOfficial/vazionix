import type { Metadata } from 'next';

import { compact, nf, shortDate } from '@/lib/format';
import { requirePermission } from '@/lib/admin/guard';
import { INVENTORY_COUNT } from '@/lib/ads/placements';
import { listAdUnits } from '@/server/admin';
import { getDailySeries } from '@/server/stats';
import { PageHeader } from '@/components/shell/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { KpiBand } from '@/components/admin/KpiBand';

export const metadata: Metadata = { title: 'Ad revenue' };

/* ============================================================================
   /admin/ads/revenue — impressions, and an explicit refusal to guess at money
   ----------------------------------------------------------------------------
   This product counts ad impressions: `AdUnit.tsx` bumps `adImpressions` when a
   slot renders into view, and the counter lands in `/stats/daily/days/{day}`. So
   the volume side of ad revenue is real and is charted here.

   WHAT IS NOT HERE, AND WHY
   No CPM, no fill rate, no revenue figure. Nothing in this codebase is told what a
   network paid: there is no reporting API wired, no postback carrying a rate, no
   settlement file. A "revenue" number on this screen would be an impression count
   multiplied by a CPM somebody typed once, presented with the same authority as a
   bank balance. Open the network's own dashboard for money; use this screen to see
   whether your inventory is actually being seen.
   ========================================================================== */

export const dynamic = 'force-dynamic';

export default async function AdRevenuePage() {
  await requirePermission('ads.view');

  const [series, units] = await Promise.all([getDailySeries(30), listAdUnits()]);

  const total = series.reduce((sum, row) => sum + row.adImpressions, 0);
  const last7 = series.slice(-7).reduce((sum, row) => sum + row.adImpressions, 0);
  const prev7 = series.slice(-14, -7).reduce((sum, row) => sum + row.adImpressions, 0);
  const delta = prev7 ? ((last7 - prev7) / prev7) * 100 : null;
  const peak = Math.max(1, ...series.map((r) => r.adImpressions));
  const filled = units.filter((u) => u.enabled && u.hasPayload).length;
  const days = series.filter((r) => r.adImpressions > 0).length;

  return (
    <>
      <PageHeader
        title="Ad revenue"
        sub="Impressions are measured here. What they paid is only known to the network."
      />

      <KpiBand
        className="mb-5"
        items={[
          {
            label: 'Impressions · 30d',
            value: compact(total),
            sub: days ? `across ${nf(days)} days with traffic` : 'nothing recorded yet',
          },
          {
            label: 'Impressions · 7d',
            value: compact(last7),
            ...(delta === null ? {} : { delta }),
            sub: prev7 ? 'vs the previous seven days' : 'no prior week to compare',
          },
          {
            label: 'Filled slots',
            value: `${nf(filled)} / ${nf(INVENTORY_COUNT)}`,
            sub: 'an empty slot cannot record an impression',
            tone: filled ? 'default' : 'danger',
          },
          {
            label: 'Revenue',
            value: 'Not measured',
            sub: 'no network reporting API is wired',
          },
        ]}
      />

      <Alert tone="info" className="mb-5">
        <strong>Revenue must come from your network&apos;s own reporting.</strong> Adsterra and AdsLab both
        report earnings per zone in their dashboards; neither pushes those numbers anywhere this app can read.
        Impressions below are counted by the ad renderer when a slot enters the viewport, so they measure
        delivery — not fill, and not payment.
      </Alert>

      <Card as="section">
        <CardHead>
          <div>
            <CardTitle>Impressions per day</CardTitle>
            <CardSub>
              From <code className="font-mono">/stats/daily/days/&#123;day&#125;.adImpressions</code>
            </CardSub>
          </div>
        </CardHead>

        {series.length ? (
          <div className="w-full overflow-auto">
            <table className="vf-table">
              <caption className="sr-only">Ad impressions per day for the last 30 days</caption>
              <thead>
                <tr>
                  <th scope="col">Day</th>
                  <th scope="col" className="th-num">
                    Impressions
                  </th>
                  <th scope="col">Share of the peak day</th>
                  <th scope="col" className="th-num">
                    Claims
                  </th>
                  <th scope="col" className="th-num">
                    Per claim
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...series].reverse().map((row) => (
                  <tr key={row.day}>
                    <td className="text-text-2">{shortDate(row.day)}</td>
                    <td className="td-num tabular">{nf(row.adImpressions)}</td>
                    <td>
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="block h-1 rounded-full bg-mint"
                          style={{ width: `${Math.round((row.adImpressions / peak) * 100)}%`, minWidth: 2 }}
                        />
                        <span className="font-mono text-11 tabular text-text-3">
                          {Math.round((row.adImpressions / peak) * 100)}%
                        </span>
                      </span>
                    </td>
                    <td className="td-num tabular text-text-3">{nf(row.claims)}</td>
                    <td className="td-num tabular text-text-3">
                      {row.claims ? (row.adImpressions / row.claims).toFixed(1) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <CardBody className="text-13 leading-body text-text-3">
            No daily counters exist yet. <code className="font-mono">/stats/daily/days</code> gets its first
            document when the first ad slot renders or the first claim lands.
          </CardBody>
        )}
      </Card>
    </>
  );
}
