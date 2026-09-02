import type { Metadata } from 'next';
import Link from 'next/link';

import { dateTime, nf, relative } from '@/lib/format';
import { requirePermission } from '@/lib/admin/guard';
import { listAudit } from '@/server/admin';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { NotConfigured } from '@/components/admin/NotConfigured';
import { Card, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';

export const metadata: Metadata = { title: 'Audit log' };

/* ============================================================================
   /admin/platform/audit — who did what
   ----------------------------------------------------------------------------
   `/auditLog`, newest first, with cursor paging on the row timestamp.

   THE CURSOR IS A TIMESTAMP, NOT A DOCUMENT ID
   `listAudit` accepts an ISO string and does `startAfter(date)`. That makes a page
   link shareable and bookmarkable — pasting the URL lands on the same page tomorrow
   — where a document-snapshot cursor would need a round trip to resolve first.

   Every write in the console lands here: suspensions, adjustments, config saves, ad
   unit edits, catalogue changes, and refused attempts. A denied `balance.adjust` is
   logged as `balance.adjust.denied`, because repeated denials on a money permission
   are a signal rather than noise.
   ========================================================================== */

export const dynamic = 'force-dynamic';

/** Money and access actions get a tone; everything else stays neutral. */
function toneFor(action: string): 'danger' | 'warning' | 'mint' | 'neutral' {
  if (action.endsWith('.denied')) return 'danger';
  if (action.startsWith('money.') || action.startsWith('withdrawal.')) return 'warning';
  if (action.startsWith('user.suspend') || action.startsWith('user.ban')) return 'warning';
  if (action.startsWith('config.') || action.startsWith('ads.')) return 'mint';
  return 'neutral';
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params] = await Promise.all([searchParams, requirePermission('audit.view')]);

  const raw = params['cursor'];
  const cursor = (Array.isArray(raw) ? raw[0] : raw) ?? null;

  const { rows, cursor: next } = await listAudit(60, cursor);

  const actors = new Set(rows.map((r) => r.actorUid));
  const denials = rows.filter((r) => r.action.endsWith('.denied')).length;
  const newest = rows[0];
  const oldest = rows[rows.length - 1];

  return (
    <ScaffoldPage
      perm="audit.view"
      title="Audit log"
      sub={
        newest
          ? `${nf(rows.length)} rows on this page · newest ${relative(newest.at)}`
          : 'No audit rows recorded yet'
      }
      kpis={[
        { label: 'Rows on page', value: nf(rows.length), sub: '60 per page' },
        { label: 'Distinct actors', value: nf(actors.size), sub: 'staff accounts in this page' },
        {
          label: 'Refused attempts',
          value: nf(denials),
          sub: denials ? 'permission denied and logged' : 'none on this page',
          tone: denials ? 'danger' : 'default',
        },
        {
          label: 'Window',
          value: oldest && newest ? `${relative(oldest.at)} →` : '—',
          sub: newest ? dateTime(newest.at) : 'nothing logged',
        },
      ]}
    >
      {rows.length ? (
        <Card as="section">
          <CardHead>
            <div>
              <CardTitle>Entries</CardTitle>
              <CardSub>
                <code className="font-mono">/auditLog</code> · append-only, written by the server
              </CardSub>
            </div>
          </CardHead>
          <div className="w-full overflow-auto">
            <table className="vf-table">
              <caption className="sr-only">Audit log entries with actor, action, target and detail</caption>
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Actor</th>
                  <th scope="col">Action</th>
                  <th scope="col">Target</th>
                  <th scope="col">Detail</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap text-text-3">{dateTime(row.at)}</td>
                    <td>
                      <span className="flex flex-col">
                        <span className="text-text-2">{row.actorName}</span>
                        <span className="font-mono text-11 text-text-3">{row.actorUid.slice(0, 12)}</span>
                      </span>
                    </td>
                    <td>
                      <Pill tone={toneFor(row.action)}>{row.action}</Pill>
                    </td>
                    <td className="font-mono text-12 text-text-3">{row.target || '—'}</td>
                    <td className="max-w-[360px] text-text-3">{row.detail || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
            <span className="text-12 text-text-3">
              {cursor ? 'Paged from a timestamp cursor — this URL is shareable.' : 'First page.'}
            </span>
            <span className="flex gap-3">
              {cursor ? (
                <Link
                  href="/admin/platform/audit"
                  className="text-12 font-semibold text-text-2 hover:text-text"
                >
                  ← Newest
                </Link>
              ) : null}
              {next ? (
                <Link
                  href={`/admin/platform/audit?cursor=${encodeURIComponent(next)}`}
                  className="text-12 font-semibold text-text-2 hover:text-text"
                >
                  Older →
                </Link>
              ) : null}
            </span>
          </div>
        </Card>
      ) : (
        <NotConfigured
          what="Audit entries"
          collection="/auditLog"
          how="A row is written by the server on every staff action that changes something — a suspension, a balance adjustment, a config save, an ad unit edit. The log fills itself as the console is used."
        />
      )}
    </ScaffoldPage>
  );
}
