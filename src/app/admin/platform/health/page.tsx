import type { Metadata } from 'next';

import { nf, relative } from '@/lib/format';
import { requirePermission } from '@/lib/admin/guard';
import { captchaEnabled, captchaProvider, captchaSpec } from '@/lib/captcha/config';
import { INVENTORY_COUNT } from '@/lib/ads/placements';
import { countWhere, listAdUnits } from '@/server/admin';
import { getPlatformStats } from '@/server/stats';
import { railStatus } from '@/server/payouts';
import { getSiteConfig } from '@/server/config';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';
import { Alert } from '@/components/ui/Alert';

export const metadata: Metadata = { title: 'System health' };

/* ============================================================================
   /admin/platform/health — is anything actually wired up
   ----------------------------------------------------------------------------
   Not an uptime dashboard. There is no APM in this build, no p95 latency series and
   no error log collection — so instead of drawing a green chart from nothing, this
   screen answers the question a fresh deployment actually raises: which integrations
   are configured, and when did each subsystem last do something?

   Every row is a real observation: an environment variable is present or it is not, a
   counter has a timestamp or it does not, a collection has documents or it does not. A
   subsystem that has never run says so rather than showing "operational".
   ========================================================================== */

export const dynamic = 'force-dynamic';

export default async function HealthPage() {
  await requirePermission('system.view');

  const [stats, site, units, users, withdrawals, tickets, audit] = await Promise.all([
    getPlatformStats(),
    getSiteConfig(),
    listAdUnits(),
    countWhere('users'),
    countWhere('withdrawals'),
    countWhere('tickets'),
    countWhere('auditLog'),
  ]);

  const rails = railStatus();
  const filledAds = units.filter((u) => u.enabled && u.hasPayload).length;
  const spec = captchaSpec();

  const integrations: Array<{ name: string; ok: boolean; detail: string }> = [
    {
      name: 'Firebase Admin SDK',
      ok: users > 0 || withdrawals > 0 || audit > 0,
      detail:
        users > 0 || audit > 0
          ? `Reads are working — ${nf(users)} users, ${nf(audit)} audit rows.`
          : 'No document has been read from any collection. Either the project is empty or FIREBASE_SERVICE_ACCOUNT_KEY is missing.',
    },
    {
      name: 'FaucetPay',
      ok: rails.FaucetPay.configured,
      detail: rails.FaucetPay.configured
        ? 'FAUCETPAY_API_KEY is set. Approving a payout on this rail sends immediately.'
        : 'FAUCETPAY_API_KEY is absent. Approve is withheld on FaucetPay rows in the queue.',
    },
    {
      name: 'CWallet',
      ok: rails.CWallet.configured,
      detail: rails.CWallet.configured
        ? 'CWALLET_API_KEY is set.'
        : 'CWALLET_API_KEY is absent. Approve is withheld on CWallet rows.',
    },
    {
      name: 'Captcha',
      ok: captchaEnabled,
      detail: captchaEnabled
        ? `${spec.label} configured. Modules with requireCaptcha will verify.`
        : `Provider is "${captchaProvider}" with no site key, so captcha gates pass through. The faucet is the most automated surface on the site.`,
    },
    {
      name: 'Ad inventory',
      ok: filledAds > 0,
      detail:
        filledAds > 0
          ? `${nf(filledAds)} of ${nf(INVENTORY_COUNT)} placements filled.`
          : `No unit is filled. All ${nf(INVENTORY_COUNT)} placements render placeholders and nothing earns.`,
    },
  ];

  const subsystems: Array<{ name: string; value: string; detail: string }> = [
    {
      name: 'Stats counters',
      value: stats.updatedAt ? relative(stats.updatedAt) : 'never',
      detail: '/stats/global — bumped inside every credit and payout transaction',
    },
    {
      name: 'Presence',
      value: `${nf(stats.onlineNow)} online`,
      detail: 'count() over users seen in the last five minutes — the one live query on the site',
    },
    {
      name: 'Withdrawal pipeline',
      value: `${nf(withdrawals)} requests ever`,
      detail: '/withdrawals',
    },
    { name: 'Support', value: `${nf(tickets)} tickets ever`, detail: '/tickets' },
    { name: 'Audit trail', value: `${nf(audit)} rows`, detail: '/auditLog — append-only' },
  ];

  const broken = integrations.filter((i) => !i.ok).length;

  return (
    <ScaffoldPage
      perm="system.view"
      title="System health"
      sub={`${nf(integrations.length - broken)} of ${nf(integrations.length)} integrations configured`}
      kpis={[
        {
          label: 'Integrations ready',
          value: `${nf(integrations.length - broken)} / ${nf(integrations.length)}`,
          sub: broken ? 'see the table below' : 'everything wired',
          tone: broken ? 'danger' : 'success',
        },
        {
          label: 'Counters last written',
          value: stats.updatedAt ? relative(stats.updatedAt) : 'never',
          sub: '/stats/global',
        },
        { label: 'Online now', value: nf(stats.onlineNow), sub: 'last five minutes' },
        {
          label: 'Maintenance',
          value: site.maintenance ? 'ON' : 'Off',
          sub: site.maintenance ? 'platform closed' : 'platform open',
          tone: site.maintenance ? 'danger' : 'default',
        },
      ]}
    >
      <Alert tone="info">
        <strong>There is no uptime monitoring in this build.</strong> No APM, no latency series, no error log
        collection. This screen reports configuration and last-activity, which is what can be observed from
        inside the app — a green &quot;operational&quot; badge drawn from nothing would be worse than the gap.
      </Alert>

      <Card as="section">
        <CardHead>
          <div>
            <CardTitle>Integrations</CardTitle>
            <CardSub>Environment presence, checked at request time</CardSub>
          </div>
        </CardHead>
        <div className="w-full overflow-auto">
          <table className="vf-table">
            <caption className="sr-only">External integrations and their configuration state</caption>
            <thead>
              <tr>
                <th scope="col">Integration</th>
                <th scope="col">State</th>
                <th scope="col">Detail</th>
              </tr>
            </thead>
            <tbody>
              {integrations.map((row) => (
                <tr key={row.name}>
                  <td className="text-text-2">{row.name}</td>
                  <td>
                    <Pill tone={row.ok ? 'success' : 'danger'}>{row.ok ? 'configured' : 'missing'}</Pill>
                  </td>
                  <td className="max-w-[460px] text-text-3">{row.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card as="section">
        <CardHead>
          <div>
            <CardTitle>Subsystem activity</CardTitle>
            <CardSub>When each part of the product last did something</CardSub>
          </div>
        </CardHead>
        <div className="w-full overflow-auto">
          <table className="vf-table">
            <caption className="sr-only">Subsystem last activity</caption>
            <thead>
              <tr>
                <th scope="col">Subsystem</th>
                <th scope="col">Observation</th>
                <th scope="col">Source</th>
              </tr>
            </thead>
            <tbody>
              {subsystems.map((row) => (
                <tr key={row.name}>
                  <td className="text-text-2">{row.name}</td>
                  <td className="font-mono text-12 tabular">{row.value}</td>
                  <td className="font-mono text-11 text-text-3">{row.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <CardBody className="border-t border-line text-12 leading-body text-text-3">
          A counter that has never been written is not a fault on a new deployment — it means nothing has
          happened yet. It is a fault if members are earning and it stays empty, which would mean the ledger is
          crediting without bumping stats.
        </CardBody>
      </Card>
    </ScaffoldPage>
  );
}
