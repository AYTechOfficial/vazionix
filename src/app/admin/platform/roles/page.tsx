import type { Metadata } from 'next';

import { nf } from '@/lib/format';
import { requirePermission } from '@/lib/admin/guard';
import {
  ADMIN_ROLES,
  ALL_PERMS,
  PERMISSIONS,
  ROLES,
  can,
  isDangerous,
  permCount,
} from '@/lib/admin/rbac';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { Alert } from '@/components/ui/Alert';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';

export const metadata: Metadata = { title: 'Roles and permissions' };

/* ============================================================================
   /admin/platform/roles — the matrix, as the code actually holds it
   ----------------------------------------------------------------------------
   This renders `ROLES` and `PERMISSIONS` from `src/lib/admin/rbac.ts`, so it cannot
   drift from what the guard enforces: the same table that answers `can(role, perm)`
   at request time is the table drawn here.

   IT IS READ-ONLY, AND THAT IS A CORRECTNESS DECISION
   Editing the matrix writes `/roleGrants/{role}`, which `canWithGrants` consults ahead
   of the static table. No route writes that document in this build, so a toggle here
   would either do nothing or need a route that can escalate its own caller's
   permissions — the single most dangerous endpoint in a console. It goes in with a
   typed confirmation, a blast-radius preview and an audit row, or it does not go in.

   Danger permissions are marked because they are the rows worth arguing about: they
   move money, remove access, or destroy data.
   ========================================================================== */

export const dynamic = 'force-dynamic';

export default async function RolesPage() {
  await requirePermission('roles.edit');

  const dangerous = ALL_PERMS.filter(isDangerous).length;

  return (
    <ScaffoldPage
      perm="roles.edit"
      title="Roles and permissions"
      sub={`${nf(ADMIN_ROLES.length)} roles · ${nf(ALL_PERMS.length)} permissions in ${nf(
        PERMISSIONS.length,
      )} groups`}
      kpis={ADMIN_ROLES.map((role) => ({
        label: ROLES[role].label,
        value: `${nf(permCount(role))} / ${nf(ALL_PERMS.length)}`,
        sub: role === 'super_admin' ? 'unrestricted' : 'permissions held',
      }))}
    >
      <Alert tone="info">
        <strong>Read-only in this build.</strong> A grant edit writes{' '}
        <code className="font-mono text-12">/roleGrants/&#123;role&#125;</code>, and no route does. An endpoint
        that rewrites the permission matrix can escalate its own caller, so it ships with a typed confirmation, a
        preview of which staff and screens change, and an audit row — or not at all.
      </Alert>

      {PERMISSIONS.map((group) => (
        <Card key={group.g} as="section">
          <CardHead>
            <div>
              <CardTitle>{group.g}</CardTitle>
              <CardSub>
                {nf(group.items.length)} permissions ·{' '}
                {nf(group.items.filter((i) => isDangerous(i.id)).length)} marked dangerous
              </CardSub>
            </div>
          </CardHead>
          <div className="w-full overflow-auto">
            <table className="vf-table">
              <caption className="sr-only">{group.g} permissions by role</caption>
              <thead>
                <tr>
                  <th scope="col">Permission</th>
                  <th scope="col">Id</th>
                  {ADMIN_ROLES.map((role) => (
                    <th key={role} scope="col">
                      {ROLES[role].label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {group.items.map((item) => (
                  <tr key={item.id}>
                    <td className="text-text-2">
                      <span className="flex items-center gap-2">
                        {item.label}
                        {isDangerous(item.id) ? <Pill tone="danger">danger</Pill> : null}
                      </span>
                    </td>
                    <td className="font-mono text-11 text-text-3">{item.id}</td>
                    {ADMIN_ROLES.map((role) => (
                      <td key={role}>
                        {can(role, item.id) ? (
                          <span className="text-mint" title={`${ROLES[role].label} holds ${item.id}`}>
                            <span aria-hidden="true">✓</span>
                            <span className="sr-only">held</span>
                          </span>
                        ) : (
                          <span className="text-text-3">
                            <span aria-hidden="true">—</span>
                            <span className="sr-only">not held</span>
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}

      <Card as="section">
        <CardHead>
          <div>
            <CardTitle>Roles</CardTitle>
            <CardSub>What each one is for, in the words the login screen uses</CardSub>
          </div>
        </CardHead>
        <CardBody className="flex flex-col gap-4">
          {ADMIN_ROLES.map((role) => (
            <div key={role} className="flex flex-col gap-1">
              <span className="flex flex-wrap items-center gap-2">
                <Pill tone={ROLES[role].tone}>{ROLES[role].label}</Pill>
                <span className="font-mono text-11 tabular text-text-3">
                  {nf(permCount(role))} of {nf(ALL_PERMS.length)} permissions
                </span>
              </span>
              <span className="text-13 leading-body text-text-3">{ROLES[role].desc}</span>
            </div>
          ))}
          <p className="text-12 leading-body text-text-3">
            {nf(dangerous)} of the {nf(ALL_PERMS.length)} permissions are marked dangerous. Super Admin is the
            only role that can edit this matrix or trigger a lockdown, and it short-circuits every check — that
            is the break-glass guarantee that a mis-saved grant cannot lock every human out of the console that
            repairs grants.
          </p>
        </CardBody>
      </Card>
    </ScaffoldPage>
  );
}
