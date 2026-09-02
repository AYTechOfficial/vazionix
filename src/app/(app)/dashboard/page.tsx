import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Droplet, Flame, Receipt } from 'lucide-react';

import { compact, dateTime, fullDate, signedTokens, tokens, usd } from '@/lib/format';
import { pct } from '@/lib/utils';
import { ButtonLink } from '@/components/ui/Button';
import { Card, CardHead, CardTitle, Divider } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pill } from '@/components/ui/Pill';
import { ProgressBar, ProgressRing } from '@/components/ui/Progress';
import { PageHeader } from '@/components/shell/PageHeader';
import { Reveal } from '@/components/motion/Reveal';
import { AdBanner, AdRail, AdUnit } from '@/components/ads/AdUnit';
import { EarningsCard } from '@/components/pages/dashboard/EarningsCard';
import { FaucetClaim } from '@/components/earn/FaucetClaim';
import { HeroStats } from '@/components/pages/dashboard/HeroStats';
import { OfferRail } from '@/components/pages/dashboard/OfferRail';
import { QuickActions } from '@/components/pages/dashboard/QuickActions';
import { getEconomy, getPayoutRails } from '@/server/config';
import { earningsByDay, listLedger } from '@/server/ledger';
import { getFaucetState, formatWait } from '@/server/earn/faucet';
import { listOfferProviders } from '@/server/earn/offerwall';
import { getAllLeaderboards } from '@/server/social';
import { requireUser } from '@/server/session';
import { getProfile } from '@/server/users';

export const metadata: Metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

/* ============================================================================
   DASHBOARD — the home screen
   ----------------------------------------------------------------------------
   Every number on this page is read from Firestore for the signed-in account:
   the balance, the week's earnings and their week-over-week delta, the daily
   stacked chart, the five most recent ledger rows, the leaderboard standings and
   the faucet cooldown.

   Server Component. Only the genuinely interactive islands ship JavaScript.

   Nine ad placements, all empty until filled: leaderboard above the header, a
   large leaderboard under the stat band, an in-feed unit in the quick-action
   grid, a rectangle between the chart and the activity table, a native unit in
   the offer rail, an outstream video below activity, two rail units, and a
   footer leaderboard.
   ========================================================================== */

const STANDING_BOARDS = [
  { label: 'Faucet', key: 'faucet' },
  { label: 'PTC', key: 'ptc' },
  { label: 'Offerwall', key: 'offerwall' },
] as const;

export default async function DashboardPage() {
  const claims = await requireUser();

  const [profile, faucet, days, ledger, providers, boards, rails, economy] = await Promise.all([
    getProfile(claims.uid, claims.emailVerified),
    getFaucetState(claims.uid),
    earningsByDay(claims.uid, 30),
    listLedger(claims.uid, { limit: 6 }),
    listOfferProviders(null),
    getAllLeaderboards(claims.uid),
    getPayoutRails(),
    getEconomy(),
  ]);

  const chartRows = days.map((d) => ({
    d: d.day.slice(5).split('-').reverse().join('/'),
    faucet: d.faucet,
    ptc: d.ptc,
    offerwall: d.offerwall,
    bonus: d.bonus,
    challenge: d.challenge,
  }));

  const dayTotals = days.map((d) => d.faucet + d.ptc + d.offerwall + d.bonus + d.challenge);
  const week = dayTotals.slice(-7).reduce((a, b) => a + b, 0);
  const previousWeek = dayTotals.slice(-14, -7).reduce((a, b) => a + b, 0);
  const today = dayTotals[dayTotals.length - 1] ?? 0;

  return (
    <>
      <AdUnit placement="dashboard.top" className="mb-4" />

      <PageHeader
        title={`Welcome back, ${profile?.username ?? 'member'}`}
        sub={
          <>
            {profile?.streak
              ? `You are on a ${profile.streak}-day streak and earned `
              : 'You have earned '}
            <strong className="font-semibold text-mint">{tokens(today)} tokens</strong> today.
          </>
        }
        actions={
          <>
            <ButtonLink href="/transactions" variant="secondary">
              <Receipt />
              Transactions
            </ButtonLink>
            <ButtonLink href="/faucet" variant="primary">
              <Droplet />
              Claim faucet
            </ButtonLink>
          </>
        }
      />

      <Reveal className="mt-5">
        <HeroStats
          weekTokens={week}
          previousWeekTokens={previousWeek}
          trend={dayTotals.slice(-14)}
          streakTarget={economy.daily.steps.length}
        />
      </Reveal>

      <AdBanner placement="dashboard.underHero" />

      <Reveal stagger childSelector="a">
        <QuickActions
          faucetReady={faucet.secondsRemaining <= 0}
          faucetLabel={`Ready in ${formatWait(faucet.secondsRemaining)}`}
          providerCount={providers.filter((p) => p.enabled).length}
          commissionRate={profile?.commissionRate ?? 5}
          railCount={rails.length}
        />
      </Reveal>

      <div className="mt-4">
        <AdUnit placement="dashboard.inFeed" />
      </div>

      <div className="mt-5 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Reveal stagger childSelector="section" className="flex min-w-0 flex-col gap-5">
          <EarningsCard days={chartRows} />

          <AdUnit placement="dashboard.midContent" />

          <OfferRail providers={providers} country={profile?.country ?? 'your region'} />

          <Card as="section">
            <CardHead>
              <CardTitle>Recent activity</CardTitle>
              <ButtonLink href="/transactions" variant="ghost" size="sm">
                All transactions
                <ArrowRight />
              </ButtonLink>
            </CardHead>

            {ledger.entries.length === 0 ? (
              <EmptyState
                art="success"
                title="Nothing here yet"
                body="Your first faucet claim shows up in this table within a second of claiming it."
                action={
                  <ButtonLink href="/faucet" variant="primary" size="sm">
                    Claim the faucet
                  </ButtonLink>
                }
              />
            ) : (
              <div className="w-full overflow-x-auto">
                <table className="vf-table">
                  <caption className="sr-only">Your most recent balance movements</caption>
                  <thead>
                    <tr>
                      <th scope="col">Source</th>
                      <th scope="col">Detail</th>
                      <th scope="col" className="th-num">
                        Amount
                      </th>
                      <th scope="col">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.entries.map((row) => (
                      <tr key={row.id}>
                        <td className="capitalize">{row.source}</td>
                        <td className="text-text-3">{row.label}</td>
                        <td
                          className={
                            row.amount < 0
                              ? 'td-num tabular !text-danger'
                              : 'td-num tabular !text-success'
                          }
                        >
                          {signedTokens(row.amount)}
                        </td>
                        <td className="text-text-3">{dateTime(row.at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <AdUnit placement="dashboard.video" />
        </Reveal>

        <aside className="flex min-w-0 flex-col gap-4">
          <Card as="section" pad="md">
            <div className="flex items-center gap-4">
              <ProgressRing
                value={profile?.exp ?? 0}
                max={profile?.expNext ?? 100}
                size={78}
                thickness={6}
                srLabel={`Level ${profile?.level ?? 1}, ${profile?.exp ?? 0} of ${profile?.expNext ?? 100} experience`}
                label={
                  <>
                    <div className="font-mono text-16 font-semibold tabular">{profile?.level ?? 1}</div>
                    <div className="text-[9px] tracking-[0.06em] text-text-3">LEVEL</div>
                  </>
                }
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center gap-2">
                  <strong className="text-14">{profile?.username}</strong>
                  <Pill tone="violet">{profile?.tier}</Pill>
                </div>
                <div className="truncate text-11 text-text-3">{profile?.email}</div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {profile?.streak ? (
                    <Pill tone="warning" icon={Flame}>
                      {profile.streak} days
                    </Pill>
                  ) : null}
                  <Pill>
                    {profile?.exp ?? 0}/{profile?.expNext ?? 100} exp
                  </Pill>
                </div>
              </div>
            </div>

            <Divider className="my-4" />

            <dl className="kv">
              <dt>Total earned</dt>
              <dd className="font-mono tabular">{usd(profile?.totalEarnedUsd ?? 0)}</dd>
              <dt>Member since</dt>
              <dd>{fullDate(profile?.memberSince)}</dd>
              <dt>Faucet claims</dt>
              <dd className="font-mono tabular">{profile?.claims.faucet ?? 0}</dd>
              <dt>Referrals</dt>
              <dd className="font-mono tabular">{profile?.claims.referrals ?? 0}</dd>
            </dl>
          </Card>

          <FaucetClaim initialState={faucet} compact />

          <Card as="section" pad="md">
            <div className="mb-3 flex items-center justify-between">
              <CardTitle>Your standings</CardTitle>
              <Link
                href="/leaderboard"
                className="text-11 text-text-3 transition-colors duration-fast ease-out hover:text-text-2"
              >
                Leaderboard →
              </Link>
            </div>
            <div className="flex flex-col gap-3">
              {STANDING_BOARDS.map(({ label, key }) => {
                const board = boards[key];
                const cutoff = board.rows[board.rows.length - 1]?.value ?? 0;
                const gap = Math.max(0, cutoff - board.you.value);
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between text-12">
                      <span className="text-text-2">{label}</span>
                      <span className="font-mono tabular text-text-3">
                        #{board.you.rank ?? '—'}
                      </span>
                    </div>
                    <ProgressBar
                      className="mt-1.5"
                      value={pct(board.you.value, cutoff || 1)}
                      label={`${label} standing`}
                    />
                    <div className="mt-1 text-[10px] text-text-3">
                      {board.rows.length === 0
                        ? 'No entries this period yet — first claim takes the board'
                        : gap > 0
                          ? `${compact(gap)} more to reach the board`
                          : 'On the board'}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <AdRail placement="dashboard.railTop" />
          <AdUnit placement="dashboard.railBottom" />
        </aside>
      </div>

      <AdBanner placement="dashboard.bottom" />
    </>
  );
}
