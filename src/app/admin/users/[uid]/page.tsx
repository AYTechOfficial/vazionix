import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, LifeBuoy } from 'lucide-react';

import { compact, tokens, usd } from '@/lib/format';
import { allowFor, requirePermission } from '@/lib/admin/guard';
import { getUserDetail } from '@/server/admin';
import { getRates } from '@/server/config';
import { PageHeader } from '@/components/shell/PageHeader';
import { ButtonLink } from '@/components/ui/Button';
import { CountryChip } from '@/components/ui/Avatar';
import { Pill } from '@/components/ui/Pill';
import { KpiBand } from '@/components/admin/KpiBand';
import { UserDetailTabs } from '@/components/admin/UserDetailTabs';

/* ============================================================================
   /admin/users/[uid] — one account, end to end
   ----------------------------------------------------------------------------
   Server Component. It reads the account plus its four subcollections in one
   `getUserDetail()` call, and resolves the permission booleans the tabs render
   against from the VERIFIED session. The client component receives booleans, not
   a role and a rulebook: there is no client-side authority to spoof, only props
   that decide what to draw.

   `notFound()` on a missing document rather than an empty shell. A uid that does
   not resolve is a bad link or a deleted account, and either way the honest answer
   is 404 — not a page of dashes that looks like a user with no data.
   ========================================================================== */

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ uid: string }>;
}): Promise<Metadata> {
  const { uid } = await params;
  return { title: `Account ${uid.slice(0, 8)}` };
}

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ uid: string }>;
}) {
  const [{ uid }, session] = await Promise.all([params, requirePermission('user.view')]);
  const allow = allowFor(session);

  const [user, rates] = await Promise.all([getUserDetail(uid), getRates()]);
  if (!user) notFound();

  return (
    <>
      <div className="mb-4">
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-1 text-12 font-semibold text-text-2 hover:text-text"
        >
          <ChevronLeft aria-hidden="true" className="size-[13px]" />
          All users
        </Link>
      </div>

      <PageHeader
        title={user.username}
        sub={
          <span className="flex flex-wrap items-center gap-2">
            <CountryChip code={user.countryCode} />
            {user.email || 'no email on file'} · <span className="font-mono">{user.uid}</span>
          </span>
        }
        actions={
          <>
            {user.suspended ? (
              <Pill tone="danger">Suspended</Pill>
            ) : (
              <Pill tone="success">Active</Pill>
            )}
            {user.emailVerified ? null : <Pill tone="warning">Email unverified</Pill>}
            {allow('support.view') ? (
              <ButtonLink href="/admin/support/tickets" variant="secondary">
                <LifeBuoy aria-hidden="true" />
                Tickets
              </ButtonLink>
            ) : null}
          </>
        }
      />

      <KpiBand
        className="mb-5"
        items={[
          {
            label: 'Spendable',
            value: tokens(user.balance),
            sub: `${usd(user.balance * rates.usdPerToken)} at the current rate`,
          },
          {
            label: 'Locked',
            value: tokens(user.lockedBalance),
            sub: user.lockedBalance ? 'reserved by in-flight payouts' : 'nothing in flight',
          },
          {
            label: 'Lifetime earned',
            value: compact(user.totalEarned),
            sub: 'tokens credited all time',
          },
          { label: 'Level', value: String(user.level), sub: `${user.streakDays}-day streak` },
          {
            label: 'Referrals',
            value: String(user.referralCount),
            sub: user.referredBy ? 'invited by another member' : 'joined directly',
          },
          {
            label: 'Risk score',
            value: String(user.riskScore),
            sub: user.riskScore >= 70 ? 'high' : user.riskScore >= 40 ? 'medium' : 'low',
            tone: user.riskScore >= 70 ? 'danger' : 'default',
          },
        ]}
      />

      <UserDetailTabs
        user={user}
        role={session.role}
        perms={{
          'user.edit': allow('user.edit'),
          'user.security': allow('user.security'),
          'user.note': allow('user.note'),
          'user.suspend': allow('user.suspend'),
          'user.ban': allow('user.ban'),
          'user.delete': allow('user.delete'),
          'user.export': allow('user.export'),
          'balance.adjust': allow('balance.adjust'),
          'withdrawal.approve': allow('withdrawal.approve'),
          'fraud.review': allow('fraud.review'),
        }}
        usdPerToken={rates.usdPerToken}
      />
    </>
  );
}
