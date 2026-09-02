'use client';

import * as React from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Star } from 'lucide-react';

import { usePrefersReducedMotion, useDragScroll } from '@/lib/hooks';
import type { OfferProviderItem } from '@/lib/models';
import { ButtonLink, IconButton } from '@/components/ui/Button';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pill } from '@/components/ui/Pill';
import { TaskCard } from '@/components/ui/TaskCard';
import { AdUnit } from '@/components/ads/AdUnit';

/* ============================================================================
   OFFER PROVIDER RAIL
   ----------------------------------------------------------------------------
   Drag-to-scroll, 34px controls, scroll-snap, and one native ad unit inside the
   rail. The ad gets a premium surface and is tagged in the sponsor hue, so it
   can never read as an offer that pays the user.

   Providers come from `/offerwallProviders`. With none configured the rail says
   so and links to the offerwall page rather than rendering an empty strip.
   ========================================================================== */

export function OfferRail({
  providers,
  country,
}: {
  providers: OfferProviderItem[];
  country: string;
}) {
  const railRef = useDragScroll<HTMLDivElement>();
  const reduced = usePrefersReducedMotion();

  const scrollBy = (dir: -1 | 1) => {
    railRef.current?.scrollBy({ left: dir * 260, behavior: reduced ? 'auto' : 'smooth' });
  };

  const live = providers.filter((p) => p.enabled);

  return (
    <Card as="section">
      <CardHead>
        <div className="min-w-0">
          <CardTitle>Offer providers</CardTitle>
          <CardSub>
            {live.length ? `Available to ${country} right now` : 'Nothing connected yet'}
          </CardSub>
        </div>
        {live.length > 2 ? (
          <div className="flex items-center gap-2">
            <IconButton aria-label="Scroll providers left" onClick={() => scrollBy(-1)}>
              <ChevronLeft />
            </IconButton>
            <IconButton aria-label="Scroll providers right" onClick={() => scrollBy(1)}>
              <ChevronRight />
            </IconButton>
            <ButtonLink href="/offerwall" variant="ghost" size="sm">
              View all
              <ArrowRight />
            </ButtonLink>
          </div>
        ) : null}
      </CardHead>

      <CardBody>
        {live.length === 0 ? (
          <div className="flex flex-col gap-4">
            <EmptyState
              art="search"
              title="No offerwall providers connected"
              body="Offerwalls are the highest-paying surface here. Connect them in Admin → Modules → Offerwall."
            />
            {/* The rail still earns even with no providers in it. */}
            <AdUnit placement="dashboard.native" />
          </div>
        ) : (
          <div
            ref={railRef}
            className="flex cursor-grab snap-x snap-proximity gap-3 overflow-x-auto pb-2 no-scrollbar [&>*]:flex-none [&>*]:snap-start"
          >
            {live.slice(0, 4).map((p) => (
              <ProviderCard key={p.id} provider={p} />
            ))}

            <div className="flex-none">
              <AdUnit placement="dashboard.native" />
            </div>

            {live.slice(4).map((p) => (
              <ProviderCard key={p.id} provider={p} />
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function ProviderCard({ provider }: { provider: OfferProviderItem }) {
  return (
    <TaskCard
      width={236}
      title={provider.name}
      desc={provider.blurb || 'Surveys, offers and app installs'}
      reward={provider.rating.toFixed(1)}
      rewardUnit="/ 5 rating"
      thumb={
        <span
          className="grid size-full place-items-center text-on-vivid"
          style={{
            background: `linear-gradient(150deg, hsl(${provider.hue} 62% 42%), hsl(${(provider.hue + 40) % 360} 58% 26%))`,
          }}
        >
          {provider.mark}
        </span>
      }
      meta={
        provider.featured ? (
          <Pill tone="mint" icon={Star}>
            Featured
          </Pill>
        ) : undefined
      }
      action={
        <ButtonLink href="/offerwall" variant="secondary" size="sm">
          Open
        </ButtonLink>
      }
    />
  );
}
