'use client';

import * as React from 'react';
import { ExternalLink, Layers, Star } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { OfferProviderItem } from '@/lib/models';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Pill } from '@/components/ui/Pill';
import { AdCard } from '@/components/ads/AdUnit';

/* ============================================================================
   OFFERWALL PROVIDER DIRECTORY
   ----------------------------------------------------------------------------
   Each provider opens in a managed panel with the tracking notice shown BEFORE
   the wall loads, not buried in a footer. Users are about to hand a third party
   an identifier and complete tasks for them; saying so first is both the decent
   thing and the thing that stops the "why didn't my offer credit" ticket, because
   the panel also states how long a postback takes.

   The iframe URL is built server-side with the viewer's uid substituted in. A
   provider with no URL configured is rendered as unavailable rather than as a
   button that opens `about:blank`.
   ========================================================================== */

export function OfferProviders({ providers }: { providers: OfferProviderItem[] }) {
  const [active, setActive] = React.useState<OfferProviderItem | null>(null);

  if (!providers.length) {
    return (
      <Card as="section" className="mt-5">
        <CardBody>
          <EmptyState
            art="search"
            title="No offerwall providers connected"
            body="Add each provider in Admin → Modules → Offerwall with its iframe URL and postback secret. The postback endpoint is /api/offerwall/{providerId}."
          />
        </CardBody>
      </Card>
    );
  }

  return (
    <>
      <Card as="section" className="mt-5">
        <CardHead>
          <div className="min-w-0">
            <CardTitle>Providers</CardTitle>
            <CardSub>All paying into the same balance</CardSub>
          </div>
        </CardHead>

        <CardBody>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {providers.map((p, index) => (
              <React.Fragment key={p.id}>
                {index === 3 ? (
                  <li className="flex">
                    <AdCard placement="offerwall.inGrid" />
                  </li>
                ) : null}
                <li
                  className={cn(
                    'flex items-center gap-3 rounded-md border border-line bg-surface-1 p-4',
                    'transition-[border-color,background-color] duration-base ease-out',
                    'hover:border-line-strong hover:bg-surface-2',
                  )}
                >
                  <span
                    className="grid size-10 flex-none place-items-center rounded-[10px] font-display text-13 font-bold text-on-vivid"
                    style={{
                      background: `linear-gradient(150deg, hsl(${p.hue} 62% 42%), hsl(${(p.hue + 40) % 360} 58% 26%))`,
                    }}
                  >
                    {p.mark}
                  </span>

                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-13 font-semibold">{p.name}</span>
                    <span className="flex items-center gap-1 text-11 text-text-3">
                      <Star aria-hidden="true" className="size-3" />
                      {p.rating.toFixed(1)} / 5
                      {p.blurb ? ` · ${p.blurb}` : ''}
                    </span>
                  </span>

                  {p.url ? (
                    <Button variant="secondary" size="sm" onClick={() => setActive(p)}>
                      Open
                    </Button>
                  ) : (
                    <Pill tone="neutral">Unconfigured</Pill>
                  )}
                </li>
              </React.Fragment>
            ))}
          </ul>
        </CardBody>
      </Card>

      {active ? (
        <Modal
          open={Boolean(active)}
          onClose={() => setActive(null)}
          title={active.name}
          description="Conversion tracking notice"
          className="w-[min(980px,calc(100vw-32px))]"
        >
          <div className="flex flex-col gap-4">
            <Alert tone="info">
              This wall is operated by {active.name}, not by us. Opening it shares your account identifier so
              they can credit your completions. Rewards arrive by server postback — usually within minutes,
              occasionally up to 12 hours. Every conversion, including pending ones, is listed in{' '}
              <strong>Offerwall → History</strong>.
            </Alert>

            <div className="overflow-hidden rounded-md border border-line bg-surface-2">
              <iframe
                title={`${active.name} offerwall`}
                src={active.url ?? ''}
                className="h-[62vh] w-full border-0"
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-popups-to-escape-sandbox"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <a
                href={active.url ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-12 font-semibold text-mint hover:underline"
              >
                <ExternalLink aria-hidden="true" className="size-3" />
                Open in a new tab instead
              </a>
              <Button variant="secondary" size="sm" onClick={() => setActive(null)}>
                <Layers aria-hidden="true" />
                Back to providers
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
