'use client';

import * as React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

import { brand } from '@/lib/brand';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { BrandLock } from '@/components/brand/BrandMark';

/* ============================================================================
   ERROR BOUNDARY
   ----------------------------------------------------------------------------
   The last line before Next's default error screen, which on a payouts product is
   the worst possible thing to show: a black page with a stack trace, on the site
   holding somebody's balance.

   THE DIGEST IS SHOWN ON PURPOSE
   Next replaces the real message with an opaque `digest` in production so a stack
   trace cannot leak. That digest is the only handle support has for correlating a
   report with a server log, so it is rendered and made copyable rather than hidden.
   The message itself is deliberately not shown — it is either the digest or a
   development-only string.

   `reset()` re-renders the segment rather than reloading the page, so a transient
   read failure recovers without losing scroll position or client state.
   ========================================================================== */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    /* Server-side errors are already in the platform log. This catches the client
       half — a hydration failure or a render throw — which otherwise goes nowhere. */
    console.error('[boundary]', error.digest ?? error.message, error);
  }, [error]);

  return (
    <div className="ambient-mesh grid min-h-screen place-items-center px-6 py-12">
      <div className="w-full max-w-[560px]">
        <BrandLock href="/" className="mb-8" />

        <Card pad="lg">
          <span className="grid size-11 place-items-center rounded-md bg-danger-dim text-danger">
            <AlertTriangle aria-hidden="true" className="size-6" />
          </span>

          <h1 className="mt-4 text-20 font-semibold tracking-snug">Something broke on our side</h1>
          <p className="mt-2 text-14 leading-body text-text-3">
            Your balance and your transaction history are untouched — this is a rendering failure, not a money
            one. Try again, and if it keeps happening send us the reference below.
          </p>

          {error.digest ? (
            <p className="mt-4 rounded-sm border border-line bg-surface-2 px-3 py-2 font-mono text-12 text-text-2">
              Reference: {error.digest}
            </p>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-2">
            <Button variant="primary" onClick={reset}>
              <RotateCcw aria-hidden="true" />
              Try again
            </Button>
            <ButtonLink href="/dashboard" variant="secondary">
              Back to the dashboard
            </ButtonLink>
            <a
              href={`mailto:${brand.email.support}?subject=${encodeURIComponent(
                `Error ${error.digest ?? 'report'}`,
              )}`}
              className="inline-flex h-[38px] items-center rounded-sm px-4 text-14 font-semibold text-text-2 transition-colors duration-fast ease-out hover:bg-surface-2 hover:text-text"
            >
              Email support
            </a>
          </div>
        </Card>
      </div>
    </div>
  );
}
