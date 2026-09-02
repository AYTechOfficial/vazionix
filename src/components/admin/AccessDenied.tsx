import * as React from 'react';
import { ChevronLeft } from 'lucide-react';

import { brand } from '@/lib/brand';
import { PERM_META, ROLES, type AdminRole, type Permission } from '@/lib/admin/rbac';
import { ButtonLink } from '@/components/ui/Button';

/* ============================================================================
   403 — THE REFUSAL SURFACE
   ----------------------------------------------------------------------------
   Wording carried over verbatim from the prototype's `denied()`. It does four
   things a generic "Forbidden" does not:

     1. Names the SCREEN you tried to open.
     2. Names the exact PERMISSION in machine form (`treasury.view`) *and* in
        the catalogue's human form ("View reserve balances"), so the admin can
        ask for the right thing.
     3. Names the ROLE they actually hold, so they can see the mismatch.
     4. Says who can fix it and where.

   An admin who is refused with no explanation opens a ticket. An admin who is
   refused with the permission id copies it into Slack and is unblocked in a
   minute. That difference is the entire justification for this component.
   ========================================================================== */

export function AccessDenied({
  perm,
  role,
  title,
  reason,
}: {
  perm: Permission | null;
  role: AdminRole | null;
  /** The screen that was refused, e.g. "Treasury". */
  title?: string;
  /** 'not-staff' when the caller is signed in but holds no admin claim at all. */
  reason?: 'not-staff' | 'permission';
}) {
  const notStaff = reason === 'not-staff' || !role;
  const meta = perm ? PERM_META[perm] : null;

  return (
    <div className="flex flex-col items-center gap-4 px-6 py-20 text-center">
      <svg viewBox="0 0 96 96" fill="none" aria-hidden="true" className="size-24">
        <rect x="26" y="42" width="44" height="32" rx="6" stroke="var(--danger)" strokeWidth="2.5" />
        <path d="M36 42V32a12 12 0 0 1 24 0v10" stroke="var(--danger)" strokeWidth="2.5" />
        <circle cx="48" cy="57" r="4" fill="var(--danger)" />
      </svg>

      <h1 className="text-20 font-semibold text-text">
        {notStaff
          ? 'This console is for staff accounts'
          : `You don't have access to ${title ?? meta?.group ?? 'this page'}`}
      </h1>

      <div className="max-w-[52ch] text-13 leading-body text-text-3">
        {notStaff ? (
          <>
            You are signed in, but this account holds no staff role. The admin console is separate from{' '}
            <strong className="font-semibold text-text-2">{brand.domain}</strong> and access is granted by
            a Super Admin as a Firebase custom claim — it is not something an account can opt into.
          </>
        ) : (
          <>
            This page needs{' '}
            <strong className="font-mono font-semibold text-text-2">{perm}</strong> — “{meta?.label}”.
            Your role (<strong className="font-semibold text-text-2">{ROLES[role].label}</strong>)
            doesn&apos;t hold it.
            <br />
            <br />
            Ask a Super Admin to grant it in{' '}
            <strong className="font-semibold text-text-2">Roles &amp; permissions</strong>. Every grant is
            audit-logged, so the request and the decision are both on the record.
          </>
        )}
      </div>

      {!notStaff ? (
        <p className="max-w-[52ch] text-11 text-text-3">
          Refused server-side by <code className="font-mono">requirePermission()</code>, not by hiding a
          button. The same permission is enforced again in <code className="font-mono">firestore.rules</code>{' '}
          and in the callable behind this screen.
        </p>
      ) : null}

      <ButtonLink href="/admin" variant="secondary" className="mt-2">
        <ChevronLeft aria-hidden="true" />
        Back to command centre
      </ButtonLink>
    </div>
  );
}
