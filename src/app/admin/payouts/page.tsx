import type { Metadata } from 'next';
import Link from 'next/link';

import { nf, tokens, usd } from '@/lib/format';
import type { WithdrawalStatus } from '@/lib/models';
import { allowFor, requirePermission } from '@/lib/admin/guard';
import { listWithdrawalQueue } from '@/server/admin';
import { pendingPayoutTotal, railStatus } from '@/server/payouts';
import { getEconomy } from '@/server/config';
import { PageHeader } from '@/components/shell/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';
import { KpiBand } from '@/components/admin/KpiBand';
import { PayoutQueue } from '@/components/admin/PayoutQueue';

export const metadata: Metadata = { title: 'Withdrawal queue' };

/* ============================================================================
   /admin/payouts — the withdrawal queue
   ----------------------------------------------------------------------------
   The screen where money leaves. It reads `listWithdrawalQueue()` and hands the
   rows to a client island that owns the three decisions; the decisions themselves
   are re-authorised server-side by `/api/admin/payouts/[id]/[action]`.

   RAIL CREDENTIALS ARE SURFACED BEFORE THE FIRST CLICK, NOT AFTER IT
   `railStatus()` reports which rails have API keys in the environment. An
   automated rail with no key cannot send, so the Approve button is withheld on
   those rows and the reason is stated at the top of the page. A button that always
   fails is worse than an absent one.

   Direct payouts are deliberately not automated anywhere in this codebase —
   signing keys do not belong in a web process. Those rows offer "Record txid"
   instead, which is how the ledger learns a transaction broadcast from custody
   tooling went out.
   ========================================================================== */

export const dynamic = 'force-dynamic';

const STATUS_TABS: Array<{ value: string; label: string }> = [
  { value: 'queue', label: 'Open queue' },
  { value: 'HeldForReview', label: 'Held for review' },
  { value: 'Processing', label: 'Processing' },
  { value: 'Completed', label: 'Completed' },
  { value: 'Rejected', label: 'Rejected' },
  { value: 'Failed', label: 'Failed' },
  { value: 'all', label: 'Everything' },
];

export default async function AdminPayoutsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, session] = await Promise.all([
    searchParams,
    requirePermission('withdrawal.view'),
  ]);
  const allow = allowFor(session);

  const readOne = (key: string): string => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value) ?? '';
  };

  const requested = readOne('status') || 'queue';
  const status = STATUS_TABS.some((t) => t.value === requested) ? requested : 'queue';
  const cursor = readOne('cursor') || null;

  const [page, pending, economy] = await Promise.all([
    listWithdrawalQueue({
      status: status as WithdrawalStatus | 'queue' | 'all',
      limit: 25,
      cursor,
    }),
    pendingPayoutTotal(),
    getEconomy(),
  ]);

  const rails = railStatus();
  const missingKeys = Object.entries(rails).filter(([, s]) => s.automated && !s.configured);

  return (
    <>
      <PageHeader
        title="Withdrawal queue"
        sub={
          pending.count
            ? `${nf(pending.count)} waiting · ${usd(pending.usd)} · ${tokens(pending.tokens)} tokens locked`
            : 'Nothing waiting to send'
        }
      />

      <KpiBand
        className="mb-5"
        items={[
          { label: 'In the queue', value: nf(pending.count), sub: 'Pending, Held or Processing' },
          { label: 'Value queued', value: usd(pending.usd), sub: 'at the rate stored on each request' },
          {
            label: 'Tokens locked',
            value: tokens(pending.tokens),
            sub: 'unavailable to members until settled',
          },
          {
            label: 'Review threshold',
            value: usd(economy.withdraw.reviewThresholdUsd),
            sub: 'above this a request is held automatically',
          },
          {
            label: 'This view',
            value: nf(page.total),
            sub: STATUS_TABS.find((t) => t.value === status)?.label ?? status,
          },
        ]}
      />

      {missingKeys.length ? (
        <Alert tone="warning" className="mb-5">
          <strong>
            {missingKeys.map(([rail]) => rail).join(' and ')} {missingKeys.length > 1 ? 'have' : 'has'} no
            API key configured.
          </strong>{' '}
          Approve is withheld on those rows because the send would fail. Set{' '}
          <code className="font-mono text-12">FAUCETPAY_API_KEY</code> /{' '}
          <code className="font-mono text-12">CWALLET_API_KEY</code> and restart.
        </Alert>
      ) : null}

      <Card as="section" className="mb-5">
        <CardHead>
          <div>
            <CardTitle>Rails</CardTitle>
            <CardSub>Automation and credential state, read from the environment at request time</CardSub>
          </div>
        </CardHead>
        <CardBody className="flex flex-wrap gap-2">
          {Object.entries(rails).map(([rail, state]) => (
            <Pill
              key={rail}
              tone={state.automated ? (state.configured ? 'success' : 'danger') : 'info'}
            >
              {rail} · {state.automated ? (state.configured ? 'ready' : 'no key') : 'manual settle'}
            </Pill>
          ))}
        </CardBody>
      </Card>

      <nav aria-label="Queue filters" className="mb-4 flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={`/admin/payouts?status=${encodeURIComponent(tab.value)}`}
            className={
              tab.value === status
                ? 'rounded-sm border border-line-accent bg-mint-dim px-3 py-1.5 text-12 font-semibold text-mint'
                : 'rounded-sm border border-line bg-surface-1 px-3 py-1.5 text-12 font-semibold text-text-3 hover:border-line-strong hover:text-text-2'
            }
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <PayoutQueue
        rows={page.rows}
        rails={rails}
        canApprove={allow('withdrawal.approve')}
        cursor={page.cursor}
        status={status}
      />
    </>
  );
}
