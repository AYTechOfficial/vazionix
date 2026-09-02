import type { Metadata } from 'next';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  History,
  KeyRound,
  LifeBuoy,
  ShieldAlert,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { compact, nf, relative, tokens, usd } from '@/lib/format';
import { allowFor, requirePermission } from '@/lib/admin/guard';
import { visiblePageCount } from '@/lib/admin/nav';
import { permCount, ROLES, type Permission } from '@/lib/admin/rbac';
import { INVENTORY_COUNT } from '@/lib/ads/placements';
import { getAdminOverview, listAdUnits, listUsers, listWithdrawalQueue } from '@/server/admin';
import { getRates, getSiteConfig } from '@/server/config';
import { PageHeader } from '@/components/shell/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { ButtonLink } from '@/components/ui/Button';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { CountryChip } from '@/components/ui/Avatar';
import { Pill, StatusPill } from '@/components/ui/Pill';
import { KpiBand, type Kpi } from '@/components/admin/KpiBand';
import { RevenueChart } from '@/components/admin/RevenueChart';
import { RiskMeter } from '@/components/admin/RiskMeter';

export const metadata: Metadata = { title: 'Command centre' };

/* ============================================================================
   COMMAND CENTRE — the first screen a staff member sees
   ----------------------------------------------------------------------------
   Built around one question: what needs a human in the next hour? Not a wall of
   vanity metrics.

   EVERY SIGNAL IS DERIVED FROM A COUNT, NOT A GUESS
   Each triage row below comes from a `count()` aggregate or a document read, and
   each declares the permission needed to ACT on it — so the list is filtered to
   what this admin can actually resolve. Showing somebody an alert they have no
   power to clear is noise, and noise is how a triage queue stops being read.

   The page itself requires only `analytics.view`; every section inside is gated
   separately. Refusing an admin their home screen because they cannot see the
   treasury would be absurd.

   ON A FRESH PROJECT EVERY NUMBER HERE IS ZERO AND THE PAGE SAYS SO. The
   "all clear" state is real: no queued payouts, no open tickets, no held
   withdrawals. It is not a placeholder for data that failed to load.
   ========================================================================== */

export const dynamic = 'force-dynamic';

type Severity = 'danger' | 'warning' | 'info';

interface Signal {
  sev: Severity;
  perm: Permission;
  icon: LucideIcon;
  title: string;
  body: string;
  href: string;
  cta: string;
}

const SEV_LABEL: Record<Severity, string> = { danger: 'Urgent', warning: 'Soon', info: 'Queued' };
const SEV_TONE = { danger: 'danger', warning: 'warning', info: 'info' } as const;
const SEV_ICON_BG: Record<Severity, string> = {
  danger: 'border-danger-line bg-danger-dim text-danger',
  warning: 'border-warning-line bg-warning-dim text-warning',
  info: 'border-info-line bg-info-dim text-info',
};

export default async function AdminOverviewPage() {
  const session = await requirePermission('analytics.view');
  const allow = allowFor(session);
  const role = ROLES[session.role];

  const [overview, rates, site, queue, newest, adUnits] = await Promise.all([
    getAdminOverview(),
    getRates(),
    getSiteConfig(),
    listWithdrawalQueue({ limit: 6 }),
    listUsers({ limit: 6, sort: 'createdAt' }),
    listAdUnits(),
  ]);

  const filledAds = adUnits.filter((u) => u.enabled && u.hasPayload).length;

  /* ---- TRIAGE ------------------------------------------------------------- */
  const signals: Signal[] = [];

  if (overview.heldForReview) {
    signals.push({
      sev: 'danger',
      perm: 'withdrawal.approve',
      icon: ShieldAlert,
      title: `${overview.heldForReview} withdrawal${overview.heldForReview > 1 ? 's' : ''} held for review`,
      body: 'Over the review threshold in /config/economy. Nothing sends until somebody decides.',
      href: '/admin/payouts?status=HeldForReview',
      cta: 'Review',
    });
  }

  if (overview.pendingPayouts.count) {
    signals.push({
      sev: 'warning',
      perm: 'withdrawal.view',
      icon: Wallet,
      title: `${overview.pendingPayouts.count} payout${overview.pendingPayouts.count > 1 ? 's' : ''} queued`,
      body: `${usd(overview.pendingPayouts.usd)} across the queue · ${tokens(
        overview.pendingPayouts.tokens,
      )} tokens locked while they wait.`,
      href: '/admin/payouts',
      cta: 'Open queue',
    });
  }

  if (overview.openTickets) {
    signals.push({
      sev: 'warning',
      perm: 'support.view',
      icon: LifeBuoy,
      title: `${overview.openTickets} open ticket${overview.openTickets > 1 ? 's' : ''}`,
      body: 'Open means waiting on us. Answered tickets are waiting on the member and are not counted here.',
      href: '/admin/support/tickets',
      cta: 'Inbox',
    });
  }

  const unconfiguredRails = Object.entries(overview.rails).filter(
    ([, state]) => state.automated && !state.configured,
  );
  if (unconfiguredRails.length) {
    signals.push({
      sev: 'danger',
      perm: 'withdrawal.view',
      icon: KeyRound,
      title: `${unconfiguredRails.length} automated rail without credentials`,
      body: `${unconfiguredRails
        .map(([rail]) => rail)
        .join(', ')} cannot send — approving a payout on that rail fails server-side.`,
      href: '/admin/rails',
      cta: 'Rails',
    });
  }

  if (overview.suspendedUsers) {
    signals.push({
      sev: 'info',
      perm: 'user.view',
      icon: AlertTriangle,
      title: `${overview.suspendedUsers} suspended account${overview.suspendedUsers > 1 ? 's' : ''}`,
      body: 'Each one is a hold somebody placed and nobody has lifted. Worth a periodic sweep.',
      href: '/admin/users?suspended=yes',
      cta: 'Review',
    });
  }

  if (!filledAds) {
    signals.push({
      sev: 'warning',
      perm: 'ads.edit',
      icon: AlertTriangle,
      title: 'No ad unit is filled',
      body: `${INVENTORY_COUNT} placements are reserved and every one renders a placeholder. Advertising is the primary revenue surface.`,
      href: '/admin/ads/inventory',
      cta: 'Fill inventory',
    });
  }

  const visibleSignals = signals.filter((s) => allow(s.perm));

  /* ---- KPIs --------------------------------------------------------------- */
  const chartRows = overview.series.map((row) => ({
    day: row.day,
    paidOutUsd: row.usdWithdrawn,
    accruedUsd: row.tokensCredited * rates.usdPerToken,
  }));

  const kpiCards: Array<Kpi & { perm: Permission }> = [
    {
      perm: 'analytics.view',
      label: 'Members',
      value: compact(overview.members),
      sub: `${nf(overview.membersToday)} registered today`,
    },
    {
      perm: 'analytics.view',
      label: 'Online now',
      value: nf(overview.onlineNow),
      sub: 'seen in the last five minutes',
    },
    {
      perm: 'analytics.view',
      label: 'Claims today',
      value: compact(overview.claimsToday),
      sub: 'every earning source',
    },
    {
      perm: 'treasury.view',
      label: 'Outstanding liability',
      value: usd(overview.liabilityUsd),
      sub: `${compact(overview.liabilityTokens)} tokens held by members`,
    },
    {
      perm: 'withdrawal.view',
      label: 'Queued payouts',
      value: nf(overview.pendingPayouts.count),
      sub: `${usd(overview.pendingPayouts.usd)} waiting`,
      tone: overview.heldForReview ? 'danger' : 'default',
    },
    {
      perm: 'treasury.view',
      label: 'Paid out, all time',
      value: usd(overview.paidOutUsd),
      sub: `${nf(overview.withdrawalsToday)} withdrawals today`,
    },
    {
      perm: 'support.view',
      label: 'Open tickets',
      value: nf(overview.openTickets),
      sub: 'waiting on a reply from us',
      tone: overview.openTickets ? 'danger' : 'success',
    },
    {
      perm: 'ads.view',
      label: 'Ad slots filled',
      value: `${nf(filledAds)} / ${nf(INVENTORY_COUNT)}`,
      sub: filledAds ? 'enabled and carrying a payload' : 'nothing is earning yet',
      tone: filledAds ? 'default' : 'danger',
    },
  ];

  const visibleKpis = kpiCards.filter((k) => allow(k.perm));

  return (
    <>
      <PageHeader
        title={`${session.name.split(' ')[0] ?? 'Signed in'} · command centre`}
        sub={
          <>
            Signed in as <strong className="font-semibold text-text-2">{role.label}</strong> ·{' '}
            {session.perms?.length ?? permCount(session.role)} permissions ·{' '}
            {visibleSignals.length ? (
              <strong
                className={cn(
                  'font-semibold',
                  visibleSignals.some((s) => s.sev === 'danger') ? 'text-danger' : 'text-text-2',
                )}
              >
                {visibleSignals.length} item{visibleSignals.length > 1 ? 's' : ''} need attention
              </strong>
            ) : (
              <span className="text-success">nothing needs attention</span>
            )}
          </>
        }
        actions={
          <>
            {allow('audit.view') ? (
              <ButtonLink href="/admin/platform/audit" variant="secondary">
                <History aria-hidden="true" />
                Audit log
              </ButtonLink>
            ) : null}
            {allow('withdrawal.view') ? (
              <ButtonLink href="/admin/payouts" variant="primary">
                <Wallet aria-hidden="true" />
                Withdrawal queue
              </ButtonLink>
            ) : null}
          </>
        }
      />

      {site.maintenance ? (
        <Alert tone="danger" className="mb-5">
          <strong>Maintenance mode is on.</strong> Earning and withdrawals are frozen for members and staff
          money actions are refused. Lift it in Content → Maintenance.
        </Alert>
      ) : null}

      <section aria-labelledby="triage-h">
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 id="triage-h" className="text-16 font-semibold tracking-[-0.01em]">
            Needs attention
          </h2>
          <span className="text-11 text-text-3">Filtered to what your role can act on</span>
        </div>

        {visibleSignals.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {visibleSignals.map((s) => {
              const Icon = s.icon;
              return (
                <Link
                  key={s.title}
                  href={s.href}
                  className={cn(
                    'flex items-start gap-3 rounded-md border border-line bg-surface-1 p-4',
                    'transition-[border-color,background-color] duration-base ease-out',
                    'hover:border-line-strong hover:bg-surface-2',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-[30px] flex-none place-items-center rounded-sm border',
                      SEV_ICON_BG[s.sev],
                    )}
                  >
                    <Icon aria-hidden="true" className="size-[15px]" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <strong className="text-13 font-semibold">{s.title}</strong>
                      <Pill tone={SEV_TONE[s.sev]}>{SEV_LABEL[s.sev]}</Pill>
                    </span>
                    <span className="text-12 leading-[1.5] text-text-3">{s.body}</span>
                  </span>
                  <span className="flex flex-none items-center gap-1 whitespace-nowrap text-12 font-semibold text-text-2">
                    {s.cta}
                    <ArrowRight aria-hidden="true" className="size-[13px]" />
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <Card pad="lg" className="text-center">
            <div className="flex items-center justify-center gap-2 text-success">
              <CheckCircle2 aria-hidden="true" className="size-4" />
              <strong className="text-14">All clear</strong>
            </div>
            <p className="mt-1.5 text-12 text-text-3">
              Nothing held for review, nothing queued, no open tickets within your permissions.
            </p>
          </Card>
        )}
      </section>

      <section aria-label="Key metrics" className="mt-6">
        <KpiBand items={visibleKpis} />
      </section>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          {allow('analytics.view') ? (
            <Card as="section">
              <CardHead>
                <div>
                  <CardTitle>Accrued to balances vs paid out</CardTitle>
                  <CardSub>
                    Last {overview.series.length} days · USD at {rates.usdPerToken.toFixed(8)} per token
                  </CardSub>
                </div>
                <Link
                  href="/admin/analytics/financial"
                  className="inline-flex items-center gap-1 text-12 font-semibold text-text-2 hover:text-text"
                >
                  Financial dashboard
                  <ArrowRight aria-hidden="true" className="size-[13px]" />
                </Link>
              </CardHead>
              <CardBody>
                <RevenueChart rows={chartRows} />
              </CardBody>
            </Card>
          ) : null}

          {allow('withdrawal.view') ? (
            <Card as="section">
              <CardHead>
                <div>
                  <CardTitle>Head of the withdrawal queue</CardTitle>
                  <CardSub>{nf(queue.total)} in the queue · newest first</CardSub>
                </div>
                <Link
                  href="/admin/payouts"
                  className="inline-flex items-center gap-1 text-12 font-semibold text-text-2 hover:text-text"
                >
                  Full queue
                  <ArrowRight aria-hidden="true" className="size-[13px]" />
                </Link>
              </CardHead>
              {queue.rows.length ? (
                <div className="w-full overflow-auto">
                  <table className="vf-table">
                    <caption className="sr-only">The six most recent queued withdrawals</caption>
                    <thead>
                      <tr>
                        <th scope="col">Requested</th>
                        <th scope="col">Member</th>
                        <th scope="col">Asset</th>
                        <th scope="col" className="th-num">
                          Value
                        </th>
                        <th scope="col">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {queue.rows.map((row) => (
                        <tr key={row.id}>
                          <td className="text-text-3">{relative(row.at)}</td>
                          <td>
                            <Link
                              href={`/admin/users/${row.uid}`}
                              className="flex items-center gap-2 font-semibold hover:text-mint"
                            >
                              <CountryChip code={row.countryCode} />
                              {row.username}
                            </Link>
                          </td>
                          <td className="text-text-2">
                            {row.coin} · {row.rail}
                          </td>
                          <td className="td-num tabular">{usd(row.usdValue)}</td>
                          <td>
                            <StatusPill status={row.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <CardBody className="text-13 text-text-3">
                  Nothing queued. New requests land in <code className="font-mono">/withdrawals</code> the
                  moment a member submits one.
                </CardBody>
              )}
            </Card>
          ) : null}
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          {allow('user.view') ? (
            <Card as="section" pad="md">
              <div className="mb-4 flex items-center justify-between gap-3">
                <CardTitle>Newest accounts</CardTitle>
                <Link href="/admin/users" className="text-11 text-text-3 hover:text-text-2">
                  All users →
                </Link>
              </div>
              {newest.rows.length ? (
                <ul className="flex flex-col gap-3">
                  {newest.rows.map((u) => (
                    <li key={u.uid} className="flex items-center gap-2 text-12">
                      <CountryChip code={u.countryCode} />
                      <Link
                        href={`/admin/users/${u.uid}`}
                        className="min-w-0 flex-1 truncate font-medium hover:text-mint"
                      >
                        {u.username}
                      </Link>
                      <RiskMeter score={u.riskScore} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-12 text-text-3">
                  No accounts yet. The first document in <code className="font-mono">/users</code> appears on
                  the first registration.
                </p>
              )}
              <p className="mt-3 text-11 leading-body text-text-3">
                Risk is explainable, not learned: account age, earn rate, unverified email, unqualified
                referral fan-out.
              </p>
            </Card>
          ) : null}

          {allow('treasury.view') ? (
            <Card as="section" pad="md">
              <div className="mb-4 flex items-center justify-between gap-3">
                <CardTitle>Money position</CardTitle>
                <Link href="/admin/treasury" className="text-11 text-text-3 hover:text-text-2">
                  Treasury →
                </Link>
              </div>
              <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-12">
                <dt className="text-text-3">Held by members</dt>
                <dd className="text-right font-mono tabular">{usd(overview.liabilityUsd)}</dd>
                <dt className="text-text-3">Queued to send</dt>
                <dd className="text-right font-mono tabular">{usd(overview.pendingPayouts.usd)}</dd>
                <dt className="text-text-3">Paid out to date</dt>
                <dd className="text-right font-mono tabular">{usd(overview.paidOutUsd)}</dd>
                <dt className="text-text-3">Token rate</dt>
                <dd className="text-right font-mono tabular">${rates.usdPerToken.toFixed(8)}</dd>
              </dl>
              <p className="mt-3 text-11 leading-body text-text-3">
                Reserve balances are not read from any exchange or wallet API, so nothing here claims to know
                what is on hand to pay with.
              </p>
            </Card>
          ) : null}

          <Card as="section" pad="md">
            <CardTitle className="mb-3">Your permissions</CardTitle>
            <p className="mb-3 text-12 leading-[1.55] text-text-3">{role.desc}</p>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-12">
              <dt className="text-text-3">Role</dt>
              <dd className="text-right">
                <Pill tone={role.tone}>{role.label}</Pill>
              </dd>
              <dt className="text-text-3">Permissions held</dt>
              <dd className="text-right font-mono tabular">
                {session.perms?.length ?? permCount(session.role)} / 53
              </dd>
              <dt className="text-text-3">Pages visible</dt>
              <dd className="text-right font-mono tabular">
                {visiblePageCount(session.role, session.perms ? { perms: session.perms } : undefined)}
              </dd>
            </dl>
            {allow('roles.edit') ? (
              <ButtonLink
                href="/admin/platform/roles"
                variant="secondary"
                size="sm"
                block
                className="mt-4"
              >
                The permission matrix
                <ChevronRight aria-hidden="true" />
              </ButtonLink>
            ) : (
              <p className="mt-4 text-11 leading-[1.5] text-text-3">
                Only a Super Admin can change what a role holds, and every grant is audit-logged.
              </p>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
