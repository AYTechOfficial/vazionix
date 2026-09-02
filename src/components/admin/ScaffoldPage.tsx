import * as React from 'react';

import { requirePermission } from '@/lib/admin/guard';
import type { Permission } from '@/lib/admin/rbac';
import { PageHeader } from '@/components/shell/PageHeader';
import { KpiBand, type Kpi } from './KpiBand';

/* ============================================================================
   ADMIN PAGE FRAME
   ----------------------------------------------------------------------------
   One component behind every console route, so a page file is a declaration of
   what that screen IS rather than repeated chrome.

   It does two things every admin page must do:
     1. Enforces its real permission, server-side, before rendering anything. A
        Support agent opening `/admin/treasury` gets the 403 surface that names the
        missing permission.
     2. Renders the real header and KPI band from whatever the page read.

   An earlier revision of this component also rendered a "specified in the
   prototype" marker and its KPIs came from fixture modules. Both are gone: a
   screen with no data now says so with an `EmptyState` naming the Firestore
   collection that drives it, which is information an operator can act on.
   ========================================================================== */

export interface AdminPageProps {
  perm: Permission;
  title: string;
  sub?: React.ReactNode;
  kpis?: readonly Kpi[];
  actions?: React.ReactNode;
  children?: React.ReactNode;
}

export async function ScaffoldPage({ perm, title, sub, kpis, actions, children }: AdminPageProps) {
  // Server-side. Redirects to /admin/403 naming the missing permission.
  await requirePermission(perm);

  return (
    <>
      <PageHeader title={title} sub={sub} actions={actions} />
      {kpis?.length ? <KpiBand items={kpis} className="mb-5" /> : null}
      {children ? <div className="flex flex-col gap-5">{children}</div> : null}
    </>
  );
}

export { ScaffoldPage as AdminPage };
