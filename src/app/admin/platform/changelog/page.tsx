import type { Metadata } from 'next';

import { dateTime, nf, relative } from '@/lib/format';
import { requirePermission } from '@/lib/admin/guard';
import { listAudit, listCatalogue } from '@/server/admin';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { NotConfigured } from '@/components/admin/NotConfigured';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';

export const metadata: Metadata = { title: 'Changelog' };

/* ============================================================================
   /admin/platform/changelog — what changed on this platform
   ----------------------------------------------------------------------------
   Two different questions get confused here, so this screen separates them.

   RELEASES — what was deployed. That lives in git and in the deploy history, not in
   Firestore, and nothing writes a `/changelog` document. A release log maintained by
   hand in a database drifts from the code within a week.

   OPERATIONAL CHANGES — what an operator changed at runtime: a reward, a rate, a kill
   switch. Those are all in the audit log already, and the config subset of it is
   genuinely a changelog. That is what the second card shows, filtered to config and
   ad-unit writes.
   ========================================================================== */

export const dynamic = 'force-dynamic';

export default async function ChangelogPage() {
  await requirePermission('system.view');

  const [entries, audit] = await Promise.all([listCatalogue('changelog', 50), listAudit(60, null)]);

  const configChanges = audit.rows.filter(
    (row) => row.action.startsWith('config.') || row.action.startsWith('ads.unit.'),
  );
  const latest = configChanges[0];

  return (
    <ScaffoldPage
      perm="system.view"
      title="Changelog"
      sub="Release notes live in git; runtime changes live in the audit log"
      kpis={[
        { label: 'Release entries', value: nf(entries.length), sub: 'documents in /changelog' },
        {
          label: 'Runtime changes',
          value: nf(configChanges.length),
          sub: 'config and ad-unit writes in the last 60 audit rows',
        },
        {
          label: 'Most recent',
          value: latest ? relative(latest.at) : '—',
          sub: latest ? latest.action : 'nothing changed yet',
        },
      ]}
    >
      {entries.length ? (
        <Card as="section">
          <CardHead>
            <div>
              <CardTitle>Release entries</CardTitle>
              <CardSub>Read-only</CardSub>
            </div>
          </CardHead>
          <div className="w-full overflow-auto">
            <table className="vf-table">
              <caption className="sr-only">Release notes</caption>
              <thead>
                <tr>
                  <th scope="col">Version</th>
                  <th scope="col">Title</th>
                  <th scope="col">Updated</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((row) => (
                  <tr key={row.id}>
                    <td className="font-mono text-12">{String(row.fields['version'] ?? row.id)}</td>
                    <td className="text-text-2">{String(row.fields['title'] ?? '—')}</td>
                    <td className="text-text-3">{relative(row.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <NotConfigured
          what="Release notes"
          collection="/changelog"
          how="Nothing writes this collection, and a hand-maintained release log in a database drifts from the code it describes. Deploy history and git are the source of truth for what shipped."
        />
      )}

      <Card as="section">
        <CardHead>
          <div>
            <CardTitle>Runtime configuration changes</CardTitle>
            <CardSub>From the audit log — config saves and ad unit writes</CardSub>
          </div>
        </CardHead>
        {configChanges.length ? (
          <div className="w-full overflow-auto">
            <table className="vf-table">
              <caption className="sr-only">Recent configuration changes made from the console</caption>
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Who</th>
                  <th scope="col">Change</th>
                  <th scope="col">Target</th>
                  <th scope="col">Detail</th>
                </tr>
              </thead>
              <tbody>
                {configChanges.map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap text-text-3">{dateTime(row.at)}</td>
                    <td className="text-text-2">{row.actorName}</td>
                    <td>
                      <Pill tone="mint">{row.action}</Pill>
                    </td>
                    <td className="font-mono text-12 text-text-3">{row.target || '—'}</td>
                    <td className="max-w-[320px] text-text-3">{row.detail || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <CardBody className="text-13 leading-body text-text-3">
            No configuration has been changed from the console yet. Every save writes a row here naming the
            actor, the section and the keys touched — which is what makes &quot;who dropped the faucet
            reward&quot; answerable.
          </CardBody>
        )}
      </Card>
    </ScaffoldPage>
  );
}
