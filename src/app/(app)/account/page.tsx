import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Coins, Flame, Sparkles, Trophy } from 'lucide-react';

import { compact, fullDate, nf, tokens, usd } from '@/lib/format';
import { Card, CardHead, CardSub, CardTitle, Divider } from '@/components/ui/Card';
import { Avatar, CountryChip } from '@/components/ui/Avatar';
import { Pill } from '@/components/ui/Pill';
import { ProgressBar } from '@/components/ui/Progress';
import { StatCard } from '@/components/ui/StatCard';
import { PageHeader } from '@/components/shell/PageHeader';
import { AdBanner, AdRail, AdUnit } from '@/components/ads/AdUnit';
import { AccountSettings } from '@/components/pages/account/AccountSettings';
import { requireUser } from '@/server/session';
import { getProfile } from '@/server/users';

export const metadata: Metadata = { title: 'Account' };
export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const claims = await requireUser();
  const profile = await getProfile(claims.uid, claims.emailVerified);
  if (!profile) redirect('/login');

  const totalClaims =
    profile.claims.faucet + profile.claims.ptc + profile.claims.shortlink + profile.claims.offerwall;

  return (
    <>
      <AdUnit placement="account.top" className="mb-4" />

      <PageHeader title="Account" sub="Your profile, level and settings" />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Lifetime earned"
          value={compact(profile.totalEarned)}
          unit="tokens"
          icon={Coins}
          sub={`≈ ${usd(profile.totalEarnedUsd)} at today's rate`}
        />
        <StatCard
          label="Level"
          value={String(profile.level)}
          icon={Trophy}
          sub={`${profile.exp} / ${profile.expNext} exp to the next one`}
        />
        <StatCard
          label="Earning bonus"
          value={`+${profile.earningBonus.toFixed(1)}%`}
          icon={Sparkles}
          sub="applied to every claim"
        />
        <StatCard
          label="Streak"
          value={nf(profile.streak)}
          unit="days"
          icon={Flame}
          sub={profile.streak ? 'claim the daily bonus to keep it' : 'claim the daily bonus to start one'}
        />
      </div>

      <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <AccountSettings profile={profile} />
        </div>

        <aside className="flex min-w-0 flex-col gap-5">
          <Card as="section" pad="md">
            <div className="flex items-center gap-3">
              <Avatar initials={profile.initials} size="lg" />
              <div className="flex min-w-0 flex-col">
                <div className="flex items-center gap-2">
                  <strong className="truncate text-14">{profile.username}</strong>
                  <Pill tone="violet">{profile.tier}</Pill>
                </div>
                <span className="truncate text-11 text-text-3">{profile.email}</span>
              </div>
            </div>

            <div className="mt-4">
              <ProgressBar
                gradient
                value={profile.exp}
                max={profile.expNext}
                label={`Level ${profile.level} progress`}
              />
              <p className="mt-1.5 text-11 text-text-3">
                {profile.exp} of {profile.expNext} exp toward level {profile.level + 1}
              </p>
            </div>

            <Divider className="my-4" />

            <dl className="kv">
              <dt>Member since</dt>
              <dd>{fullDate(profile.memberSince)}</dd>
              <dt>Country</dt>
              <dd>
                <span className="inline-flex items-center gap-1.5">
                  <CountryChip code={profile.countryCode} name={profile.country} />
                  {profile.country}
                </span>
              </dd>
              <dt>Email verified</dt>
              <dd>
                <Pill tone={profile.emailVerified ? 'success' : 'warning'}>
                  {profile.emailVerified ? 'Verified' : 'Not verified'}
                </Pill>
              </dd>
              <dt>Referral code</dt>
              <dd className="font-mono text-12">{profile.referralCode || '—'}</dd>
            </dl>
          </Card>

          <Card as="section" pad="md">
            <CardHead className="!mb-3 !border-0 !p-0">
              <div className="min-w-0">
                <CardTitle>Claim counts</CardTitle>
                <CardSub>{nf(totalClaims)} credited actions</CardSub>
              </div>
            </CardHead>
            <dl className="kv">
              <dt>Faucet</dt>
              <dd className="font-mono tabular">{nf(profile.claims.faucet)}</dd>
              <dt>PTC</dt>
              <dd className="font-mono tabular">{nf(profile.claims.ptc)}</dd>
              <dt>Shortlinks</dt>
              <dd className="font-mono tabular">{nf(profile.claims.shortlink)}</dd>
              <dt>Offerwall</dt>
              <dd className="font-mono tabular">{nf(profile.claims.offerwall)}</dd>
              <dt>Qualified referrals</dt>
              <dd className="font-mono tabular">{nf(profile.claims.referrals)}</dd>
            </dl>
          </Card>

          <Card as="section" pad="md">
            <CardTitle className="mb-2">Balances</CardTitle>
            <dl className="kv">
              <dt>Spendable</dt>
              <dd className="font-mono tabular">{tokens(profile.balance)}</dd>
              <dt>Locked in payouts</dt>
              <dd className="font-mono tabular">{tokens(profile.lockedBalance)}</dd>
              <dt>Advertiser credit</dt>
              <dd className="font-mono tabular">{usd(profile.depositBalance)}</dd>
            </dl>
          </Card>

          <AdRail placement="account.rail" />
        </aside>
      </div>

      <AdBanner placement="account.bottom" />
    </>
  );
}
