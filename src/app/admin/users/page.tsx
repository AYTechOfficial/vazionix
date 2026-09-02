import type { Metadata } from 'next';

import { compact, nf } from '@/lib/format';
import { allowFor, requirePermission } from '@/lib/admin/guard';
import { countWhere, listUsers } from '@/server/admin';
import { PageHeader } from '@/components/shell/PageHeader';
import { KpiBand } from '@/components/admin/KpiBand';
import { UsersTable } from '@/components/admin/UsersTable';

export const metadata: Metadata = { title: 'Users' };

/* ============================================================================
   /admin/users — the master table
   ----------------------------------------------------------------------------
   A Server Component that owns the query. Search term, filter, sort and cursor
   all arrive as URL parameters and are handed to `listUsers()`, because Firestore
   paging is cursor-based: a `startAfter` cursor is a document snapshot reference
   and cannot be reconstructed in the browser.

   The KPI row is three `count()` aggregates, not a scan. `count()` bills one read
   per 1000 documents matched; measuring `.size` on a `.get()` would bill every
   document in the collection on every render of this page.
   ========================================================================== */

export const dynamic = 'force-dynamic';

const SORTS = new Set(['createdAt', 'balance', 'totalEarned', 'level']);

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, session] = await Promise.all([searchParams, requirePermission('user.view')]);
  const allow = allowFor(session);

  const readOne = (key: string): string => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value) ?? '';
  };

  const search = readOne('q');
  const suspendedParam = readOne('suspended');
  const suspended = suspendedParam === 'yes' ? 'yes' : suspendedParam === 'no' ? 'no' : 'all';
  const sortParam = readOne('sort');
  const sort = SORTS.has(sortParam) ? sortParam : 'createdAt';
  const cursor = readOne('cursor') || null;
  const trail = readOne('trail').split(',').filter(Boolean);

  const [page, total, suspendedCount, unverified] = await Promise.all([
    listUsers({
      limit: 25,
      cursor,
      search: search || null,
      ...(suspended === 'all' ? {} : { suspended: suspended === 'yes' }),
      sort: sort as 'createdAt' | 'balance' | 'totalEarned' | 'level',
    }),
    countWhere('users'),
    countWhere('users', [['suspended', '==', true]]),
    countWhere('users', [['emailVerified', '==', false]]),
  ]);

  return (
    <>
      <PageHeader
        title="Users"
        sub={
          total
            ? `${compact(total)} accounts · ${nf(suspendedCount)} suspended · ${nf(
                unverified,
              )} with an unverified email`
            : 'No accounts registered yet'
        }
      />

      <KpiBand
        className="mb-5"
        items={[
          { label: 'Accounts', value: compact(total), sub: 'documents in /users' },
          {
            label: 'Suspended',
            value: nf(suspendedCount),
            sub: suspendedCount ? 'earning and withdrawing blocked' : 'none held',
            tone: suspendedCount ? 'danger' : 'success',
          },
          {
            label: 'Unverified email',
            value: nf(unverified),
            sub: 'cannot withdraw while withdraw.requireEmailVerified is on',
          },
          {
            label: 'On this page',
            value: nf(page.rows.length),
            sub: search ? 'search results' : `sorted by ${sort}`,
          },
        ]}
      />

      <UsersTable
        rows={page.rows}
        total={total}
        nextCursor={page.cursor}
        trail={trail}
        search={search}
        suspended={suspended}
        sort={sort}
        canExport={allow('user.export')}
      />
    </>
  );
}
