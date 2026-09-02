import type { Metadata } from 'next';

import { nf, relative } from '@/lib/format';
import { cookies as cookieNames } from '@/lib/brand';
import { requirePermission } from '@/lib/admin/guard';
import { listAudit, listCatalogue } from '@/server/admin';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { NotConfigured } from '@/components/admin/NotConfigured';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';

export const metadata: Metadata = { title: 'Staff sessions' };

/* ============================================================================
   /admin/platform/sessions — why there is no session list
   ----------------------------------------------------------------------------
   Firebase session cookies are STATELESS. A cookie is a signed assertion the Admin
   SDK verifies against Google's keys; no row is created anywhere when somebody signs
   in, so there is nothing to enumerate. A "sessions" table would have to be a
   parallel record this app writes on login and prunes on expiry — a second source of
   truth that is wrong the moment a cookie expires without anyone visiting.

   What actually revokes access is `revokeRefreshTokens(uid)` through the Admin SDK.
   Because `verifySessionCookie` is called with `checkRevoked: true` on every request,
   that takes effect within seconds — which is the property that makes the missing list
   acceptable. Revocation does not need a list; it needs a uid.

   The login trail below is real: staff sign-ins land in the audit log.
   ========================================================================== */

export const dynamic = 'force-dynamic';

export default async function SessionsPage() {
  await requirePermission('admin.view');

  const [staff, audit] = await Promise.all([listCatalogue('staff', 100), listAudit(60, null)]);

  const logins = audit.rows.filter(
    (row) => row.action.includes('login') || row.action.includes('session'),
  );

  return (
    <ScaffoldPage
      perm="admin.view"
      title="Staff sessions"
      sub="Session cookies are stateless — there is no session table to list"
      kpis={[
        { label: 'Staff records', value: nf(staff.length), sub: 'accounts that could hold a session' },
        {
          label: 'Session events',
          value: nf(logins.length),
          sub: 'in the last 60 audit rows',
        },
        { label: 'Revocation check', value: 'Every request', sub: 'checkRevoked: true' },
        { label: 'Cookie name', value: cookieNames.session, sub: 'httpOnly, not scriptable' },
      ]}
    >
      <Card as="section">
        <CardHead>
          <div>
            <CardTitle>How staff access is ended</CardTitle>
            <CardSub>Three mechanisms, none of which needs a session list</CardSub>
          </div>
        </CardHead>
        <CardBody className="flex flex-col gap-3 text-13 leading-body text-text-3">
          <p>
            <strong className="text-text-2">Revoke refresh tokens.</strong>{' '}
            <code className="font-mono text-12">getAuth().revokeRefreshTokens(uid)</code> invalidates every
            existing session for that account. Verification runs with{' '}
            <code className="font-mono text-12">checkRevoked: true</code>, so it bites within seconds rather than
            at the next expiry.
          </p>
          <p>
            <strong className="text-text-2">Remove the role claim.</strong> A token without a staff claim is
            treated as not-staff and refused by the guard, whatever the cookie says. This is the right move for
            somebody who has left rather than somebody whose laptop was stolen.
          </p>
          <p>
            <strong className="text-text-2">Wait it out.</strong> Session cookies expire on their own. That is
            the weakest option and the reason the first two exist.
          </p>
          <p>
            None of the three is exposed as a button here: all are Firebase Auth writes and belong to a callable
            with its own permission check, not to a page that renders a table.
          </p>
        </CardBody>
      </Card>

      {logins.length ? (
        <Card as="section">
          <CardHead>
            <div>
              <CardTitle>Session events</CardTitle>
              <CardSub>From the audit log</CardSub>
            </div>
          </CardHead>
          <div className="w-full overflow-auto">
            <table className="vf-table">
              <caption className="sr-only">Staff session events recorded in the audit log</caption>
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Who</th>
                  <th scope="col">Event</th>
                  <th scope="col">Detail</th>
                </tr>
              </thead>
              <tbody>
                {logins.map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap text-text-3">{relative(row.at)}</td>
                    <td className="text-text-2">{row.actorName}</td>
                    <td className="font-mono text-12">{row.action}</td>
                    <td className="text-text-3">{row.detail || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <NotConfigured
          what="Session events"
          collection="/auditLog where the action mentions login or session"
          how="A row is written when a staff sign-in or a revocation is recorded. None in the most recent 60 entries."
        />
      )}
    </ScaffoldPage>
  );
}
