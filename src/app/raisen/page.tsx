import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { brand } from '@/lib/brand';
import { AdProvider } from '@/components/ads/AdProvider';
import { AdUnit } from '@/components/ads/AdUnit';
import { getAdConfig } from '@/server/config';
import { DEFAULT_AD_BEHAVIOUR } from '@/lib/ads/config';
import type { PlacementId } from '@/lib/ads/placements';

export const metadata: Metadata = {
  title: `Raisen — ${brand.name}`,
  description: 'Ad inventory showcase: every banner format, one page.',
  robots: { index: false, follow: false },
};

/* ============================================================================
   RAISEN — AD INVENTORY SHOWCASE
   ----------------------------------------------------------------------------
   A single page that mounts every banner format the ad registry knows about,
   so an operator can eyeball all of the inventory — sizes, spacing, labels,
   placeholder boxes — in one scroll.

   `showPlaceholders` is forced ON for this page, overriding the runtime
   behaviour: the slots render their spec sheet (format, dimensions, placement
   id) even in production, because a showcase page with 22 invisible boxes
   would defeat its own purpose. Real tags pasted in Admin → Ads → Inventory
   still win over the placeholder, exactly like everywhere else.
   ========================================================================== */

const SHOWCASE_BEHAVIOUR = { ...DEFAULT_AD_BEHAVIOUR, showPlaceholders: true };

function Slot({ placement, className }: { placement: PlacementId; className?: string }) {
  return <AdUnit placement={placement} className={className} />;
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-display text-15 font-semibold uppercase tracking-wide text-text-2">
      {children}
    </h2>
  );
}

export default async function RaisenPage() {
  const ads = await getAdConfig();

  return (
    <AdProvider units={ads.units} behaviour={SHOWCASE_BEHAVIOUR}>
      <main className="mx-auto flex max-w-[1100px] flex-col gap-10 px-4 py-10 sm:px-6">
        {/* -- Header --------------------------------------------------------- */}
        <header className="flex flex-col gap-1">
          <h1 className="font-display text-24 font-bold text-text-1">Raisen</h1>
          <p className="text-13 text-text-3">
            Ad inventory showcase — every banner format on one page. Empty slots
            show their exact box, dimensions and placement id.
          </p>
        </header>

        {/* -- Top full-width -------------------------------------------------- */}
        <section className="flex flex-col items-center gap-6">
          <Slot placement="raisen.top" />
          <Slot placement="raisen.leaderboard1" />
          <Slot placement="raisen.largeLeaderboard" />
          <Slot placement="raisen.banner468" />
          <Slot placement="raisen.banner468b" />
        </section>

        {/* -- Rectangles & squares -------------------------------------------- */}
        <section className="flex flex-col gap-4">
          <SectionTitle>Rectangles &amp; squares</SectionTitle>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] justify-items-center gap-6">
            <Slot placement="raisen.rectangle1" />
            <Slot placement="raisen.largeRectangle1" />
            <Slot placement="raisen.rectangle2" />
            <Slot placement="raisen.largeRectangle2" />
            <Slot placement="raisen.square" />
            <Slot placement="raisen.smallSquare" />
            <Slot placement="raisen.rectangle3" />
          </div>
        </section>

        {/* -- Rails ----------------------------------------------------------- */}
        <section className="flex flex-col gap-4">
          <SectionTitle>Rail units</SectionTitle>
          <div className="flex flex-wrap items-start justify-center gap-6">
            <Slot placement="raisen.halfPage" />
            <Slot placement="raisen.skyscraper" />
            <Slot placement="raisen.halfPage2" />
          </div>
        </section>

        {/* -- Fluid ----------------------------------------------------------- */}
        <section className="flex flex-col gap-6">
          <SectionTitle>Native &amp; fluid</SectionTitle>
          <Slot placement="raisen.inFeed1" />
          <Slot placement="raisen.inFeed2" />
          <Slot placement="raisen.native1" />
          <Slot placement="raisen.native2" />
          <Slot placement="raisen.video" />
        </section>

        {/* -- Bottom full-width ----------------------------------------------- */}
        <section className="flex flex-col items-center gap-6">
          <Slot placement="raisen.leaderboard2" />
          <Slot placement="raisen.bottom" />
        </section>
      </main>
    </AdProvider>
  );
}
