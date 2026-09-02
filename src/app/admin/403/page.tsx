import type { Metadata } from 'next';

import { getAdminSession } from '@/lib/admin/guard';
import { ADMIN_ROUTE_META } from '@/lib/admin/nav';
import { isPermission, PERM_META } from '@/lib/admin/rbac';
import { AccessDenied } from '@/components/admin/AccessDenied';

export const metadata: Metadata = {
  title: 'Access denied',
  robots: { index: false, follow: false },
};

/* ============================================================================
   /admin/403
   ----------------------------------------------------------------------------
   Two callers, two messages:

     • `requirePermission()` redirects here with `?perm=treasury.view` when a
       verified staff session lacks a permission. The page names the screen,
       the permission and the role.
     • middleware redirects here with `?reason=not-staff` when a request
       carries a session cookie but no admin role hint — a signed-in end user
       who found the console.

   The `perm` parameter is validated against the catalogue rather than echoed.
   Rendering an arbitrary query string into the page is reflected XSS waiting
   for a `dangerouslySetInnerHTML`, and echoing an unknown permission id would
   in any case be a lie about what the system requires.
   ========================================================================== */

export default async function AdminForbiddenPage({
  searchParams,
}: {
  searchParams: Promise<{ perm?: string; reason?: string }>;
}) {
  const [{ perm, reason }, session] = await Promise.all([searchParams, getAdminSession()]);

  const validPerm = isPermission(perm) ? perm : null;

  /* Resolve the screen name from the nav model, so the heading says
     "Treasury" rather than the permission group. Falls back to the group. */
  const screen = validPerm
    ? Object.values(ADMIN_ROUTE_META).find((m) => m.perm === validPerm)?.title ??
      PERM_META[validPerm].group
    : undefined;

  return (
    <main className="mx-auto w-full max-w-content px-6 py-12">
      <AccessDenied
        perm={validPerm}
        role={session?.role ?? null}
        {...(screen ? { title: screen } : {})}
        reason={reason === 'not-staff' || !session ? 'not-staff' : 'permission'}
      />
    </main>
  );
}
