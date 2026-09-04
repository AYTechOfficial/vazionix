import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import '@/styles/landing.css';

import { brand } from '@/lib/brand';
import { AdProvider } from '@/components/ads/AdProvider';
import { AdBanner, AdUnit } from '@/components/ads/AdUnit';
import { getAdConfig, getPayoutRails, getRates } from '@/server/config';
import { getPayoutTicker, getPlatformStats } from '@/server/stats';
import { getReferralTiers } from '@/server/social';
import { getSessionClaims } from '@/server/session';

import { LandingNav } from '@/components/pages/landing/LandingNav';
import { LandingHero } from '@/components/pages/landing/LandingHero';
import { LandingTrust } from '@/components/pages/landing/LandingTrust';
import { LandingHow } from '@/components/pages/landing/LandingHow';
import { LandingEarn } from '@/components/pages/landing/LandingEarn';
import { LandingProof } from '@/components/pages/landing/LandingProof';
import { LandingPayouts } from '@/components/pages/landing/LandingPayouts';
import { LandingSecurity } from '@/components/pages/landing/LandingSecurity';
import { ReferralSimulator } from '@/components/pages/landing/ReferralSimulator';
import { LandingFaq } from '@/components/pages/landing/LandingFaq';
import { LandingCta } from '@/components/pages/landing/LandingCta';
import { LandingFooter } from '@/components/pages/landing/LandingFooter';
import { LandingRuntime } from '@/components/pages/landing/LandingRuntime';

export const revalidate = 60;

export const metadata: Metadata = {
  title: `${brand.name} — ${brand.tagline}`,
  description: brand.description,
  alternates: { canonical: '/' },
  openGraph: {
    title: `${brand.name} — ${brand.tagline}`,
    description: brand.description,
    url: brand.url,
    siteName: brand.name,
    type: 'website',
  },
};

/* ============================================================================
   LANDING PAGE
   ----------------------------------------------------------------------------
   The marketing surface, ported from the HTML prototype rather than
   reinterpreted. An earlier revision rebuilt this page from the design tokens in
   Tailwind and lost everything that made it worth looking at — the CSS laptop
   mockup, the pinned four-step explainer, the payout orbit, the magnetic buttons.
   Those are back, from the file they were designed in.

   THE `.vz-lp` WRAPPER IS LOAD-BEARING
   `src/styles/landing.css` is the prototype's own stylesheet with every selector
   scoped under that class. It styles bare elements — `body`, `h1`, `a`, `button` —
   and generic classes like `.card` and `.btn` that the app also uses. A Next CSS
   import is global wherever it appears, so without the wrapper this file would
   restyle the dashboard and the admin console.

   WHAT IS LIVE VERSUS WHAT IS COPY
   Live, from Firestore: the three hero counters, the payout ticker, the
   withdrawals-today figure, the settled-payout count, the asset and rail lists,
   the withdrawal minimum, and the referral tiers driving the commission slider.
   Copy, owned by the operator: the testimonials, the four-step explainer, the
   security grid and the FAQ answers. That line is deliberate — invented ACCOUNT
   data was the problem worth fixing; marketing prose on a marketing page is not
   the same thing, and a landing page with no words is not a landing page.

   Five ad placements, all empty until filled from Admin → Ads → Inventory.

   A signed-in visitor never sees this. A returning user does not need to be sold
   to, so they go straight to the dashboard.
   ========================================================================== */

export default async function LandingPage() {
  const claims = await getSessionClaims();
  if (claims) redirect('/dashboard');

  const [stats, ticker, rails, rates, tiers, ads] = await Promise.all([
    getPlatformStats(),
    getPayoutTicker(14),
    getPayoutRails(),
    getRates(),
    getReferralTiers(),
    getAdConfig(),
  ]);

  /* The lowest configured USDT minimum, formatted the way the hero quotes it.
     Reading it from the rails means the hero cannot advertise a floor the withdraw
     form would then refuse. */
  const usdtMinimums = rails
    .filter((r) => r.coin === 'USDT')
    .map((r) => Number(r.min))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  const minimum = usdtMinimums[0] ? `${usdtMinimums[0].toFixed(6)}\u00a0USDT` : 'a low minimum';

  return (
    <AdProvider units={ads.units} behaviour={ads.behaviour}>
      <div className="vz-lp">
        <a href="#main" className="skip-link">
          Skip to content
        </a>

        {/* Gradient definitions the CSS mockup and the star SVGs reference by id. */}
        <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }} focusable="false">
          <defs>
            <linearGradient id="vfg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--mint)" />
              <stop offset="100%" stopColor="var(--violet)" />
            </linearGradient>
            <linearGradient id="vfg2" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--mint)" />
              <stop offset="100%" stopColor="var(--blue)" />
            </linearGradient>
          </defs>
        </svg>

        <LandingNav />

        <main id="main">
          <LandingHero stats={stats} minimum={minimum} />

          {/* Above the fold on a short viewport, below the hero on a tall one. */}
          <div className="container">
            <AdUnit placement="landing.top" className="my-5" />
          </div>

          <LandingTrust />
          <LandingHow />

          <div className="container">
            <AdBanner placement="landing.heroBelow" />
          </div>

          <LandingEarn members={stats.members} />
          <LandingProof
            withdrawalsToday={stats.withdrawalsToday}
            payoutsAllTime={stats.withdrawalsAllTime}
            hasPayouts={ticker.length > 0}
          />

          <div className="container">
            <AdUnit placement="landing.midContent" className="mx-auto my-6" />
          </div>

          <LandingPayouts />
          <LandingSecurity withdrawalsToday={stats.withdrawalsToday} />

          <ReferralSimulator tiers={tiers} usdPerToken={rates.usdPerToken} />

          <div className="container">
            <AdUnit placement="landing.native" className="my-6" />
          </div>

          <LandingFaq />
        </main>

        <LandingCta members={stats.members} paidOutUsd={stats.paidOutUsd} />

        <div className="container">
          <AdBanner placement="landing.beforeFooter" />
        </div>

        <LandingFooter />

        {/* Enhancement only. Every section above renders its final state without
            it — see the contract at the top of the file. */}
        <LandingRuntime ticker={ticker} />
      </div>
    </AdProvider>
  );
}
