import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowRight,
  Droplet,
  Gift,
  Layers,
  Link2,
  Megaphone,
  ShieldCheck,
  Target,
  Ticket,
  Trophy,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';

import { brand } from '@/lib/brand';
import { compact, nf } from '@/lib/format';
import { ButtonLink } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { CoinIcon } from '@/components/ui/CoinIcon';
import { Pill } from '@/components/ui/Pill';
import { BrandLock } from '@/components/brand/BrandMark';
import { AdProvider } from '@/components/ads/AdProvider';
import { AdBanner, AdUnit } from '@/components/ads/AdUnit';
import { LiveStats } from '@/components/pages/landing/LiveStats';
import { getAdConfig, getEconomy, getPayoutRails } from '@/server/config';
import { getPayoutTicker, getPlatformStats } from '@/server/stats';
import { getSessionClaims } from '@/server/session';
import { COIN_NAMES, type CoinTicker } from '@/lib/models';

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
   The public front door, and the densest ad surface on the site: a billboard
   above the hero, a leaderboard under the primary call to action, a rectangle
   between sections, a native unit in the "how it works" rail, and a leaderboard
   above the footer. Five slots, all empty until filled from Admin → Ads →
   Inventory.

   EVERY NUMBER HERE IS LIVE
   Member count, online count, claims paid, payouts sent and the payout ticker are
   read from the stats counters and the withdrawals collection. The faucet reward,
   cooldown, referral rate and payout minimums come from `/config/economy` and
   `/config/rates`, so the marketing copy cannot promise a rate the product does
   not pay.

   A signed-in visitor is sent straight to the dashboard. A returning user does not
   need to be sold to.
   ========================================================================== */

export default async function LandingPage() {
  const claims = await getSessionClaims();
  if (claims) redirect('/dashboard');

  const [stats, ticker, economy, rails, ads] = await Promise.all([
    getPlatformStats(),
    getPayoutTicker(8),
    getEconomy(),
    getPayoutRails(),
    getAdConfig(),
  ]);

  const topTier = economy.referrals.tiers[economy.referrals.tiers.length - 1];
  const coins = [...new Set(rails.map((r) => r.coin))].slice(0, 12);
  const railNames = [...new Set(rails.map((r) => r.rail))];

  const lowestUsdt = rails
    .filter((r) => r.coin === 'USDT')
    .map((r) => Number(r.min))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b)[0];

  const surfaces = [
    {
      icon: Droplet,
      title: 'Faucet',
      body: `${nf(economy.faucet.reward)} tokens every ${Math.round(economy.faucet.cooldownSeconds / 60)} minutes. One button, a timer, and a captcha.`,
    },
    {
      icon: Megaphone,
      title: 'PTC ads',
      body: 'Paid to view. The dwell time is measured on our server, so the reward is paid for real attention.',
    },
    {
      icon: Link2,
      title: 'Shortlinks',
      body: 'Pass through a link, come back, get paid. Per-link daily caps reset at 00:00 UTC.',
    },
    {
      icon: Layers,
      title: 'Offerwalls',
      body: 'The highest-paying surface here. Conversions credit by server postback, including while pending.',
    },
    {
      icon: Gift,
      title: 'Daily bonus',
      body: `A ${economy.daily.steps.length}-day ladder that compounds the bonus applied to everything else you earn.`,
    },
    {
      icon: Target,
      title: 'Challenges',
      body: 'Quests that read progress straight from your real claim history.',
    },
    {
      icon: Ticket,
      title: 'Lottery',
      body: 'Weekly draw from a seed published with the result, so the draw can be re-run and checked.',
    },
    {
      icon: Users,
      title: 'Referrals',
      body: `Up to ${topTier?.rate ?? 15}% of everything your invites earn, for as long as they earn it.`,
    },
  ];

  return (
    <AdProvider units={ads.units} behaviour={ads.behaviour}>
      <div className="ambient-mesh min-h-screen">
        <header className="sticky top-0 z-sticky border-b border-glass-line bg-glass-bg backdrop-blur-[18px]">
          <div className="mx-auto flex h-topbar max-w-content items-center gap-4 px-6 max-lg:px-4">
            <BrandLock href="/" />
            <nav className="ml-auto flex items-center gap-2">
              <ButtonLink href="/login" variant="ghost" size="sm">
                Sign in
              </ButtonLink>
              <ButtonLink href="/register" variant="primary" size="sm">
                Create account
              </ButtonLink>
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-content px-6 pb-24 max-lg:px-4">
          {/* Above the hero — first impression of every organic visitor. */}
          <AdUnit placement="landing.top" className="my-5" />

          <section className="grid items-center gap-10 py-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
            <div className="min-w-0">
              <Pill tone="mint" icon={Zap} size="lg">
                {stats.onlineNow > 0
                  ? `${compact(stats.onlineNow)} earning right now`
                  : 'Instant payouts, low minimums'}
              </Pill>

              <h1 className="mt-4 font-display text-[clamp(2.1rem,5vw,3.4rem)] font-bold leading-[1.05] tracking-[-0.03em]">
                {brand.tagline}
              </h1>

              <p className="mt-4 max-w-[52ch] text-16 leading-body text-text-2">{brand.description}</p>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <ButtonLink href="/register" variant="gradient" size="lg">
                  Start earning
                  <ArrowRight />
                </ButtonLink>
                <ButtonLink href="/login" variant="secondary" size="lg">
                  I already have an account
                </ButtonLink>
              </div>

              <p className="mt-4 flex items-center gap-2 text-12 text-text-3">
                <ShieldCheck aria-hidden="true" className="size-4 flex-none" />
                No deposit, no KYC to earn. Email verification is required before your first withdrawal.
              </p>
            </div>

            <div className="min-w-0">
              <LiveStats initial={stats} initialTicker={ticker} />
            </div>
          </section>

          {/* Directly under the hero call to action. */}
          <AdBanner placement="landing.heroBelow" />

          <section className="py-10">
            <h2 className="font-display text-28 font-semibold tracking-snug max-md:text-24">
              Eight ways to earn
            </h2>
            <p className="mt-2 max-w-[60ch] text-14 leading-body text-text-3">
              All of them credit the same balance, and every credit is recorded in your transaction history with
              the exact amount and the bonus that was applied.
            </p>

            <ul className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {surfaces.map(({ icon: Icon, title, body }, index) => (
                <li key={title} className="flex flex-col">
                  {index === 4 ? (
                    <div className="mb-3">
                      <AdUnit placement="landing.native" />
                    </div>
                  ) : null}
                  <Card pad="md" hover className="h-full">
                    <span className="grid size-9 place-items-center rounded-[10px] bg-mint-dim text-mint">
                      <Icon aria-hidden="true" className="size-[18px]" />
                    </span>
                    <h3 className="mt-3 text-14 font-semibold text-text">{title}</h3>
                    <p className="mt-1 text-12 leading-body text-text-3">{body}</p>
                  </Card>
                </li>
              ))}
            </ul>
          </section>

          <AdUnit placement="landing.midContent" className="mx-auto my-6" />

          <section className="py-10">
            <div className="grid gap-8 lg:grid-cols-2">
              <div className="min-w-0">
                <h2 className="font-display text-28 font-semibold tracking-snug max-md:text-24">
                  Cash out in what you want
                </h2>
                <p className="mt-2 max-w-[52ch] text-14 leading-body text-text-3">
                  {coins.length} assets across {railNames.length}{' '}
                  {railNames.length === 1 ? 'rail' : 'rails'} —{' '}
                  {railNames.join(', ')}. Every minimum, network fee and arrival estimate is shown before you
                  confirm, never after.
                </p>

                <ul className="mt-6 flex flex-wrap gap-2">
                  {coins.map((coin) => (
                    <li key={coin}>
                      <span className="inline-flex items-center gap-2 rounded-sm border border-line bg-surface-1 px-2.5 py-1.5">
                        <CoinIcon ticker={coin as CoinTicker} size="sm" labelled={false} />
                        <span className="text-12 font-semibold text-text-2">{coin}</span>
                        <span className="text-11 text-text-3">{COIN_NAMES[coin as CoinTicker]}</span>
                      </span>
                    </li>
                  ))}
                </ul>

                {lowestUsdt ? (
                  <p className="mt-4 text-12 text-text-3">
                    Lowest USDT minimum:{' '}
                    <strong className="font-mono tabular text-text-2">{lowestUsdt} USDT</strong>.
                  </p>
                ) : null}
              </div>

              <Card as="section" pad="lg" className="min-w-0">
                <CardBody className="!p-0">
                  <h3 className="text-16 font-semibold">How a payout works</h3>
                  <ol className="mt-4 flex flex-col gap-4">
                    {[
                      {
                        title: 'You pick an asset and a rail',
                        body: 'The minimum, the fee and the network are on the tile before you choose it.',
                      },
                      {
                        title: 'We price it on our server',
                        body: 'The token cost and USD value are computed server-side and held for 30 seconds while you review.',
                      },
                      {
                        title: 'Tokens leave your spendable balance',
                        body: 'They sit locked against the payout, so a second withdrawal cannot spend the same tokens.',
                      },
                      {
                        title: 'It sends, or it comes back',
                        body: 'Automated rails settle in seconds. A rejection returns the tokens with a matching ledger row.',
                      },
                    ].map((step, index) => (
                      <li key={step.title} className="flex gap-3">
                        <span className="grid size-6 flex-none place-items-center rounded-full bg-mint-dim font-mono text-11 font-semibold text-mint">
                          {index + 1}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-13 font-semibold text-text">{step.title}</span>
                          <span className="block text-12 leading-body text-text-3">{step.body}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </CardBody>
              </Card>
            </div>
          </section>

          <section className="py-10">
            <Card pad="lg" className="text-center">
              <Wallet aria-hidden="true" className="mx-auto size-8 text-mint" />
              <h2 className="mt-3 font-display text-24 font-semibold tracking-snug">
                {stats.withdrawalsAllTime > 0
                  ? `${compact(stats.withdrawalsAllTime)} payouts sent so far`
                  : 'Be one of the first to cash out'}
              </h2>
              <p className="mx-auto mt-2 max-w-[52ch] text-14 leading-body text-text-3">
                {stats.claimsAllTime > 0
                  ? `${compact(stats.claimsAllTime)} claims credited across ${compact(stats.members)} accounts. Every one of them is a row in somebody's transaction history.`
                  : 'Everything is live and wired. The counters on this page move as soon as the first claims land.'}
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <ButtonLink href="/register" variant="gradient" size="lg">
                  Create your account
                  <ArrowRight />
                </ButtonLink>
                <ButtonLink href="/leaderboard" variant="ghost" size="lg">
                  <Trophy />
                  See the leaderboards
                </ButtonLink>
              </div>
            </Card>
          </section>

          <AdBanner placement="landing.beforeFooter" />
        </main>

        <footer className="border-t border-line bg-surface-1">
          <div className="mx-auto flex max-w-content flex-wrap items-center justify-between gap-4 px-6 py-8 max-lg:px-4">
            <div className="min-w-0">
              <BrandLock href="/" size={26} />
              <p className="mt-2 max-w-[46ch] text-11 leading-body text-text-3">
                One account per person and per network. Automation, VPNs and multi-accounting forfeit the
                balance.
              </p>
            </div>

            <nav className="flex flex-wrap items-center gap-4 text-12 text-text-3">
              <Link href="/login" className="hover:text-text-2">
                Sign in
              </Link>
              <Link href="/register" className="hover:text-text-2">
                Create account
              </Link>
              <a href={`mailto:${brand.email.support}`} className="hover:text-text-2">
                {brand.email.support}
              </a>
              {brand.social.telegram ? (
                <a
                  href={brand.social.telegram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-text-2"
                >
                  Telegram
                </a>
              ) : null}
            </nav>
          </div>
        </footer>
      </div>
    </AdProvider>
  );
}
