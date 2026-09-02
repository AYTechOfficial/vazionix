import type { Metadata } from 'next';
import { ShieldAlert } from 'lucide-react';

import { brand } from '@/lib/brand';
import { fullDate } from '@/lib/format';
import { ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { BrandLock } from '@/components/brand/BrandMark';
import { requireUser } from '@/server/session';
import { db, iso, isServerFirebaseReady, str } from '@/server/db';

export const metadata: Metadata = { title: 'Account suspended' };
export const dynamic = 'force-dynamic';

/* ============================================================================
   SUSPENDED
   ----------------------------------------------------------------------------
   The authenticated layout redirects here rather than rendering an earning UI to
   somebody who cannot earn. It states the reason recorded on the account and the
   lift date when there is one, because "your account is suspended" with no detail
   generates a support ticket every single time.

   The balance is deliberately not shown. It is intact, and saying so is enough;
   showing the number invites a negotiation the support queue cannot have.
   ========================================================================== */

export default async function SuspendedPage() {
  const claims = await requireUser();

  let reason = 'This account is suspended.';
  let until: string | null = null;

  if (isServerFirebaseReady()) {
    const snap = await db().doc(`users/${claims.uid}`).get();
    if (snap.exists) {
      reason = str(snap.get('suspendedReason'), reason);
      until = iso(snap.get('suspendedUntil'));
    }
  }

  return (
    <div className="ambient-mesh grid min-h-screen place-items-center px-6 py-12">
      <div className="w-full max-w-[520px]">
        <BrandLock href="/" className="mb-8" />

        <Card pad="lg">
          <span className="grid size-11 place-items-center rounded-md bg-danger-dim text-danger">
            <ShieldAlert aria-hidden="true" className="size-6" />
          </span>

          <h1 className="mt-4 text-20 font-semibold tracking-snug">Account suspended</h1>

          <p className="mt-2 text-14 leading-body text-text-2">{reason}</p>

          {until ? (
            <p className="mt-3 rounded-sm border border-line bg-surface-2 px-3 py-2 text-13 text-text-2">
              The suspension lifts automatically on{' '}
              <strong className="font-semibold">{fullDate(until)}</strong>. You do not need to do anything.
            </p>
          ) : (
            <p className="mt-3 text-13 leading-body text-text-3">
              Your balance is intact. If you believe this is a mistake, open a ticket and support will review the
              account.
            </p>
          )}

          <div className="mt-6 flex flex-wrap gap-2">
            <ButtonLink href="/tickets" variant="primary">
              Open a ticket
            </ButtonLink>
            <a
              href={`mailto:${brand.email.support}`}
              className="inline-flex h-[38px] items-center rounded-sm border border-line-strong bg-surface-2 px-4 text-14 font-semibold text-text transition-colors duration-fast ease-out hover:bg-surface-3"
            >
              Email support
            </a>
          </div>
        </Card>
      </div>
    </div>
  );
}
