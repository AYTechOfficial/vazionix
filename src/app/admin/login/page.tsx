import type { Metadata } from 'next';

import { AdminLoginForm } from '@/components/admin/AdminLoginForm';

export const metadata: Metadata = {
  title: 'Staff sign-in',
  robots: { index: false, follow: false },
};

/* ============================================================================
   /admin/login — the staff console sign-in
   ----------------------------------------------------------------------------
   Rendered outside the admin shell (see `AdminShell`'s BARE_ROUTES): a sidebar
   listing screens you have not yet authenticated for is the wrong frame.
   The form itself is a Client Component because it owns three fields, a
   pending state and an error state.
   ========================================================================== */

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  /* Validated here, on the server, before it reaches the form. An unvalidated
     `?next=` on a login page is an open redirect, which is a phishing
     primitive: send a staff member a link to the real login domain that
     bounces them to a copy after they authenticate. Only same-origin admin
     paths survive — no protocol-relative `//evil.com`, no absolute URL. */
  const safeNext =
    next && next.startsWith('/admin') && !next.startsWith('//') ? next : '/admin';

  return <AdminLoginForm next={safeNext} />;
}
