import type { Metadata } from 'next';
import { cookies } from 'next/headers';

import { brand } from '@/lib/brand';
import { getAdminSession } from '@/lib/admin/guard';
import { navCounts } from '@/lib/admin/counts';
import { visibleNav, visiblePageCount } from '@/lib/admin/nav';
import { permCount } from '@/lib/admin/rbac';
import { AdminShell } from '@/components/admin/AdminShell';
import { getSiteConfig } from '@/server/config';

/* ============================================================================
   ADMIN LAYOUT — the console shell
   ----------------------------------------------------------------------------
   A Server Component, and that is the whole point of it. It reads the session
   cookie, verifies it with the Admin SDK, and resolves WHICH ROUTES EXIST for this
   admin before a byte of the shell renders. The client shell receives a list of
   permitted route ids and cannot widen it.

   What this layout does NOT do is enforce. It deliberately tolerates a null
   session, because `/admin/login` and `/admin/403` are nested under it and both
   must render to a caller with no session — bouncing that person to a login form
   they will pass and then land back here is an infinite loop, and it is exactly
   the loop a naive `requireAdmin()` here would create.

   Enforcement lives one level down, on every page:
       const session = await requirePermission('treasury.view');
   That is per-route, it names the permission, and it cannot be skipped by
   navigating directly.

   LOCKDOWN comes from `/config/site`. Maintenance mode is the single kill switch:
   it stops earning and withdrawals for users and freezes staff money actions
   (see `LOCKDOWN_FROZEN_PERMS` in src/lib/admin/audit.ts). One switch rather than
   two that can disagree.
   ========================================================================== */

export const metadata: Metadata = {
  title: { default: 'Admin', template: `%s · ${brand.name} Admin` },
  /* A staff console has no business in an index. Belt-and-braces alongside the
     middleware redirect — a crawler that somehow reaches a page should not put it
     in a search result. */
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [cookieStore, session, counts, site] = await Promise.all([
    cookies(),
    getAdminSession(),
    navCounts(),
    getSiteConfig(),
  ]);

  const collapsed = cookieStore.get(`${brand.slug}-admin-sidebar`)?.value === '1';
  const overrides = session?.perms ? { perms: session.perms } : undefined;

  const allowedIds = session
    ? visibleNav(session.role, overrides).flatMap((g) => g.items.map((i) => i.id))
    : [];

  return (
    <AdminShell
      initialCollapsed={collapsed}
      allowedIds={allowedIds}
      counts={counts}
      lockdown={site.maintenance}
      identity={
        session
          ? {
              name: session.name,
              email: session.email,
              role: session.role,
              permCount: session.perms?.length ?? permCount(session.role),
              pageCount: visiblePageCount(session.role, overrides),
            }
          : null
      }
    >
      {children}
    </AdminShell>
  );
}
