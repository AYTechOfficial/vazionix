import * as React from 'react';
import { Lock } from 'lucide-react';

import { checkPermission } from '@/lib/admin/guard';
import { PERM_META, ROLES, type AdminRole, type Permission } from '@/lib/admin/rbac';
import { Alert } from '@/components/ui/Alert';

/* ============================================================================
   <PermissionGate>
   ----------------------------------------------------------------------------
   A Server Component. It awaits `checkPermission()`, which reads the VERIFIED
   session cookie — so unlike a client-side gate, the gated markup is never
   sent to a browser that may not see it. That matters: a client gate that
   renders `{can && <TreasuryTable/>}` still ships the treasury numbers in the
   RSC payload for anyone who looks.

   Three behaviours, chosen per call site:
     • `fallback` omitted        → renders nothing. Use for a nav row or a
                                   button: absence is the right answer.
     • `explain`                 → renders the standard "your role cannot X"
                                   alert. Use inside a page the admin CAN open,
                                   where a silently missing panel would read as
                                   a bug. This is the prototype's pattern on the
                                   ledger and danger-zone tabs.
     • `fallback={<…>}`          → anything else.

   It is NOT a substitute for `requirePermission()` at the top of a page. A
   page whose only protection is a gate around its body still resolves, still
   runs its data fetches, and still appears in the router. Gate components
   compose a screen; the guard decides whether the screen exists.
   ========================================================================== */

export interface PermissionGateProps {
  perm: Permission;
  children: React.ReactNode;
  /** Rendered instead of `children` when the permission is missing. */
  fallback?: React.ReactNode;
  /** Render the standard explanatory alert as the fallback. */
  explain?: boolean;
}

export async function PermissionGate({ perm, children, fallback, explain }: PermissionGateProps) {
  const allowed = await checkPermission(perm);
  if (allowed) return <>{children}</>;
  if (explain) return <PermissionNotice perm={perm} />;
  return <>{fallback ?? null}</>;
}

/**
 * The inline "your role cannot do this" notice. Pure and synchronous, so a
 * page that already knows the role can render it without a second session
 * read.
 */
export function PermissionNotice({
  perm,
  role,
  children,
}: {
  perm: Permission;
  role?: AdminRole;
  children?: React.ReactNode;
}) {
  const meta = PERM_META[perm];
  return (
    <Alert tone="info" icon={Lock}>
      {children ?? (
        <>
          {role ? (
            <>
              Your role (<strong>{ROLES[role].label}</strong>) can view this but cannot{' '}
              {meta.label.toLowerCase()}.
            </>
          ) : (
            <>Your role can view this but cannot {meta.label.toLowerCase()}.</>
          )}{' '}
          <span className="text-text-3">
            Missing <code className="font-mono">{perm}</code>.
          </span>
        </>
      )}
    </Alert>
  );
}
