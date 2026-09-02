import Link from 'next/link';
import { Compass } from 'lucide-react';

import { brand } from '@/lib/brand';
import { ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { BrandLock } from '@/components/brand/BrandMark';

/* ============================================================================
   404
   ----------------------------------------------------------------------------
   Renders outside the app shell, because a 404 can be reached without a session
   and the shell requires one. It therefore carries its own brand lock and its own
   way back — a dead end with no navigation is how a mistyped URL becomes a bounce.
   ========================================================================== */

export default function NotFound() {
  return (
    <div className="ambient-mesh grid min-h-screen place-items-center px-6 py-12">
      <div className="w-full max-w-[520px]">
        <BrandLock href="/" className="mb-8" />

        <Card pad="lg">
          <span className="grid size-11 place-items-center rounded-md bg-surface-3 text-text-2">
            <Compass aria-hidden="true" className="size-6" />
          </span>

          <h1 className="mt-4 text-20 font-semibold tracking-snug">That page does not exist</h1>
          <p className="mt-2 text-14 leading-body text-text-3">
            The link may be out of date, or the address may have a typo in it. Nothing has happened to your
            account.
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            <ButtonLink href="/dashboard" variant="primary">
              Go to the dashboard
            </ButtonLink>
            <ButtonLink href="/faucet" variant="secondary">
              Claim the faucet
            </ButtonLink>
          </div>

          <p className="mt-5 text-11 text-text-3">
            Still stuck?{' '}
            <Link href="/tickets" className="font-semibold text-mint underline underline-offset-2">
              Open a ticket
            </Link>{' '}
            or email{' '}
            <a
              href={`mailto:${brand.email.support}`}
              className="font-semibold text-mint underline underline-offset-2"
            >
              {brand.email.support}
            </a>
            .
          </p>
        </Card>
      </div>
    </div>
  );
}
