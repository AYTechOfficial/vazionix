import type { Metadata } from 'next';
import Link from 'next/link';

import { nf, relative } from '@/lib/format';
import { requirePermission } from '@/lib/admin/guard';
import { listCatalogue } from '@/server/admin';
import { ROLES, isAdminRole, permCount } from '@/lib/admin/rbac';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { NotConfigured } from '@/components/admin/NotConfigured';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';

export const metadata: Metadata = { title: 'Staff' };

/* ============================================================================
   /admin/platform/staff — who holds a console role
   ----------------------------------------------------------------------------
   `/staff/{uid}` is a MIRROR, not the authority. The role that decides what a
   request may do lives in the Firebase Auth custom claims on the verified token;
   these documents exist so the console can show a display name next to a uid without
   an Auth lookup per row.

   That distinction matters when the two disagree. A document saying `finance` while
   the token says `support` grants nothing — every check reads the token. So a row
   here is evidence somebody ran `setStaffRole`, not evidence they currently have
   access.

   Granting or revoking a role is an Auth write and belongs to a callable, which is
   why there is no button on this screen.
   ========================================================================== */

export const dynamic = 'force-dynamic';

export default async function StaffPage() {
  await requirePermission('admin.view');
  const rows = await listCatalogue('staff', 100);

  const byRole = new Map<string, number>();
  for (const row of rows) {
    const role = String(row.fields['role'] ?? 'unknown');
    byRole.set(role, (byRole.get(role) ?? 0) + 1);
  }

  return (
    <ScaffoldPage
      perm="admin.view"
      title="Staff"
      sub={`${nf(rows.length)} staff record${rows.length === 1 ? '' : 's'} mirrored in /staff`}
      kpis={[
        { label: 'Records', value: nf(rows.length), sub: 'documents in /staff' },
        {
          label: 'Distinct roles',
          value: nf(byRole.size),
          sub: [...byRole.keys()].join(', ') || 'none',
        },
        { label: 'Authority', value: 'Auth claims', sub: 'these documents are a display mirror' },
      ]}
    >
      {rows.length ? (
        <Card as="section">
          <CardHead>
            <div>
              <CardTitle>Staff records</CardTitle>
              <CardSub>Read-only — a role change is a Firebase Auth write, not a Firestore one</CardSub>
            </div>
          </CardHead>
          <div className="w-full overflow-auto">
            <table className="vf-table">
              <caption className="sr-only">Staff records with mirrored role and last update</caption>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">UID</th>
                  <th scope="col">Mirrored role</th>
                  <th scope="col" className="th-num">
                    Permissions
                  </th>
                  <th scope="col">Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const role = String(row.fields['role'] ?? '');
                  const known = isAdminRole(role);
                  return (
                    <tr key={row.id}>
                      <td className="font-semibold text-text">{String(row.fields['name'] ?? '—')}</td>
                      <td className="font-mono text-11 text-text-3">{row.id}</td>
                      <td>
                        {known ? (
                          <Pill tone={ROLES[role].tone}>{ROLES[role].label}</Pill>
                        ) : (
                          <Pill tone="neutral">{role || 'not set'}</Pill>
                        )}
                      </td>
                      <td className="td-num tabular text-text-3">
                        {known ? `${permCount(role)} / 53` : '—'}
                      </td>
                      <td className="text-text-3">{relative(row.updatedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <NotConfigured
          what="Staff records"
          collection="/staff"
          how="A document is written by setStaffRole() when a Super Admin grants a console role. Until then the console still works — it falls back to the email local part for a display name — because the role itself lives in the Auth token, not here."
        />
      )}

      <Card as="section">
        <CardHead>
          <div>
            <CardTitle>How access is actually granted</CardTitle>
            <CardSub>Three layers, and none of them is this table</CardSub>
          </div>
        </CardHead>
        <CardBody className="text-13 leading-body text-text-3">
          <p>
            A role is a Firebase Auth custom claim, set with the Admin SDK. It rides inside the ID token, so a
            permission check costs zero document reads — which is why the same check is affordable in the server
            guard, in the security rules and in every callable.
          </p>
          <p className="mt-2">
            Consequence worth knowing: a claim change only takes effect on the next token refresh. Revoking
            someone urgently means revoking their sessions, not editing a row.{' '}
            <Link href="/admin/platform/roles" className="font-semibold text-text-2 hover:text-text">
              The permission matrix
            </Link>{' '}
            shows what each role holds.
          </p>
        </CardBody>
      </Card>
    </ScaffoldPage>
  );
}
