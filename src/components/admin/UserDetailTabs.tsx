'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Coins, LifeBuoy, Lock, User, Users, Wallet } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  cryptoAmount,
  dateTime,
  relative,
  shortAddr,
  shortDate,
  signedTokens,
  tokens,
  usd,
} from '@/lib/format';
import { ApiError, api } from '@/lib/api';
import { ROLES, type AdminRole, type Permission } from '@/lib/admin/rbac';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { CountryChip } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, Hint, Input, Label } from '@/components/ui/Input';
import { Pill, StatusPill } from '@/components/ui/Pill';
import { Tabs, TabPanel } from '@/components/ui/Tabs';
import { useToast } from '@/components/ui/Toast';
import { RiskMeter } from './RiskMeter';

/* ============================================================================
   USER DETAIL — six tabs over what the database actually holds
   ----------------------------------------------------------------------------
   Every tab reads something `getUserDetail()` actually returned: the last 50
   claims, the last 25 withdrawals, the referral list, the ticket list. An earlier
   revision had nine tabs, four of them fed by a fixture — login history, device
   fingerprints, IP reputation, internal notes. Nothing records those yet, so they
   are gone rather than faked. When `/users/{uid}/logins` exists, that tab returns.

   TWO PRINCIPLES SURVIVE FROM THE PROTOTYPE

   1. Permission booleans arrive from the server, already resolved against the
      verified session. This component never calls `can()`, so there is no
      client-side authority to spoof — only props that decide what to draw. The
      routes behind the buttons re-check regardless.

   2. Every destructive action states its blast radius BEFORE offering itself. A
      suspension says how many tokens stop moving; an adjustment previews the
      resulting balance and requires the username typed back. "Are you sure?" is
      not a safeguard.
   ========================================================================== */

export interface UserDetailData {
  uid: string;
  username: string;
  email: string;
  countryCode: string;
  level: number;
  balance: number;
  lockedBalance: number;
  totalEarned: number;
  referralCount: number;
  suspended: boolean;
  emailVerified: boolean;
  createdAt: string;
  lastSeenAt: string | null;
  riskScore: number;
  referralCode: string;
  referredBy: string | null;
  referralTier: string;
  commissionBps: number;
  earningBonusBps: number;
  streakDays: number;
  claimCounts: Record<string, number>;
  suspendedReason: string | null;
  signupIp: string | null;
  recentClaims: Array<{ id: string; source: string; amount: number; label: string; at: string }>;
  withdrawals: Array<{
    id: string;
    coin: string;
    rail: string;
    address: string;
    receiveAmount: string;
    tokenCost: number;
    status: string;
    txid: string | null;
    at: string;
    processedAt: string | null;
    failureReason: string | null;
  }>;
  referrals: Array<{ uid: string; username: string; level: number; qualified: boolean; joined: string }>;
  tickets: Array<{ id: string; subject: string; status: string; updated: string }>;
}

export type UserPerms = Partial<Record<Permission, boolean>>;

const TABS = [
  { value: 'profile', label: 'Profile', icon: User },
  { value: 'claims', label: 'Claims', icon: Coins },
  { value: 'withdrawals', label: 'Withdrawals', icon: Wallet },
  { value: 'referrals', label: 'Referrals', icon: Users },
  { value: 'support', label: 'Support', icon: LifeBuoy },
  { value: 'actions', label: 'Account actions', icon: AlertTriangle },
] as const;

type TabValue = (typeof TABS)[number]['value'];

export interface UserDetailProps {
  user: UserDetailData;
  role: AdminRole;
  perms: UserPerms;
  /** USD per internal token, from /config/rates. */
  usdPerToken: number;
}

export function UserDetailTabs(props: UserDetailProps) {
  const [tab, setTab] = React.useState<TabValue>('profile');
  const idBase = 'user-detail';

  return (
    <>
      <div className="mb-5 border-b border-line">
        <Tabs
          items={TABS.map((t) => ({
            value: t.value,
            label: t.label,
            ...(t.value === 'withdrawals' && props.user.withdrawals.length
              ? { count: props.user.withdrawals.length }
              : {}),
            ...(t.value === 'support' && props.user.tickets.length
              ? { count: props.user.tickets.length }
              : {}),
          }))}
          value={tab}
          onValueChange={setTab}
          variant="line"
          label="User detail sections"
          idBase={idBase}
        />
      </div>

      <TabPanel idBase={idBase} value={tab}>
        {tab === 'profile' ? <ProfileTab {...props} /> : null}
        {tab === 'claims' ? <ClaimsTab {...props} /> : null}
        {tab === 'withdrawals' ? <WithdrawalsTab {...props} /> : null}
        {tab === 'referrals' ? <ReferralsTab {...props} /> : null}
        {tab === 'support' ? <SupportTab {...props} /> : null}
        {tab === 'actions' ? <ActionsTab {...props} /> : null}
      </TabPanel>
    </>
  );
}

/* ---- SHARED BITS ---------------------------------------------------------- */

function Kv({ rows }: { rows: ReadonlyArray<[string, React.ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[minmax(0,150px)_1fr] gap-x-4 gap-y-3 p-5 text-13">
      {rows.map(([key, value]) => (
        <React.Fragment key={key}>
          <dt className="text-text-3">{key}</dt>
          <dd className="min-w-0 break-words text-text-2">{value}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

function NoPermission({ role, what }: { role: AdminRole; what: string }) {
  return (
    <Alert tone="info" icon={Lock}>
      Your role (<strong>{ROLES[role].label}</strong>) can read this account but cannot {what}.
    </Alert>
  );
}

/* ---- PROFILE -------------------------------------------------------------- */

function ProfileTab({ user, usdPerToken }: UserDetailProps) {
  const claimTotal = Object.values(user.claimCounts).reduce((sum, n) => sum + n, 0);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card as="section">
        <CardHead>
          <div>
            <CardTitle>Account</CardTitle>
            <CardSub>/users/{user.uid}</CardSub>
          </div>
        </CardHead>
        <Kv
          rows={[
            ['Username', <strong key="u" className="font-semibold text-text">{user.username}</strong>],
            ['Email', user.email || <span className="text-text-3">not set</span>],
            [
              'Email verified',
              user.emailVerified ? (
                <Pill tone="success">verified</Pill>
              ) : (
                <Pill tone="warning">unverified</Pill>
              ),
            ],
            ['Country', <CountryChip key="c" code={user.countryCode} />],
            ['Registered', `${dateTime(user.createdAt)} · ${relative(user.createdAt)}`],
            ['Last seen', user.lastSeenAt ? relative(user.lastSeenAt) : 'never recorded'],
            [
              'Signup IP',
              user.signupIp ? <code key="ip" className="font-mono text-12">{user.signupIp}</code> : '—',
            ],
            ['Risk', <RiskMeter key="r" score={user.riskScore} />],
          ]}
        />
      </Card>

      <Card as="section">
        <CardHead>
          <div>
            <CardTitle>Balance and progression</CardTitle>
            <CardSub>Counters maintained by the ledger, not recomputed here</CardSub>
          </div>
        </CardHead>
        <Kv
          rows={[
            [
              'Spendable',
              <span key="b" className="font-mono tabular">
                {tokens(user.balance)} tokens · {usd(user.balance * usdPerToken)}
              </span>,
            ],
            [
              'Locked',
              <span key="l" className="font-mono tabular">
                {tokens(user.lockedBalance)} tokens
                {user.lockedBalance ? (
                  <span className="ml-2 text-11 text-text-3">in-flight payouts</span>
                ) : null}
              </span>,
            ],
            [
              'Lifetime earned',
              <span key="e" className="font-mono tabular">
                {tokens(user.totalEarned)} tokens
              </span>,
            ],
            ['Level', <span key="lv" className="font-mono tabular">{user.level}</span>],
            ['Streak', `${user.streakDays} consecutive day${user.streakDays === 1 ? '' : 's'}`],
            [
              'Earning bonus',
              <span key="bo" className="font-mono tabular">
                +{(user.earningBonusBps / 100).toFixed(2)}%
              </span>,
            ],
            ['Claims recorded', <span key="cc" className="font-mono tabular">{tokens(claimTotal)}</span>],
          ]}
        />
      </Card>

      <Card as="section" className="lg:col-span-2">
        <CardHead>
          <div>
            <CardTitle>Claims by source</CardTitle>
            <CardSub>
              claimCounts on the user document, bumped inside the same transaction as each credit
            </CardSub>
          </div>
        </CardHead>
        {Object.keys(user.claimCounts).length ? (
          <div className="grid gap-3 p-5 [grid-template-columns:repeat(auto-fit,minmax(140px,1fr))]">
            {Object.entries(user.claimCounts).map(([source, count]) => (
              <div key={source} className="rounded-sm border border-line bg-surface-2 px-3 py-2">
                <div className="text-11 uppercase tracking-wide text-text-3">{source}</div>
                <div className="font-mono text-16 font-semibold tabular">{tokens(count)}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-5 py-6 text-13 text-text-3">No claims recorded against this account yet.</p>
        )}
      </Card>
    </div>
  );
}

/* ---- CLAIMS --------------------------------------------------------------- */

function ClaimsTab({ user, usdPerToken }: UserDetailProps) {
  if (!user.recentClaims.length) {
    return (
      <EmptyState
        art="inbox"
        title="No claims on this account"
        body={
          <>
            <code className="font-mono">/users/{user.uid}/claims</code> is empty. Every credit the ledger
            writes appears here, newest first.
          </>
        }
      />
    );
  }

  return (
    <Card as="section">
      <CardHead>
        <div>
          <CardTitle>Last {user.recentClaims.length} claims</CardTitle>
          <CardSub>Newest first · the same rows the member sees in their own history</CardSub>
        </div>
      </CardHead>
      <div className="w-full overflow-auto">
        <table className="vf-table">
          <caption className="sr-only">Recent claims for {user.username}</caption>
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Source</th>
              <th scope="col">Label</th>
              <th scope="col" className="th-num">
                Amount
              </th>
              <th scope="col" className="th-num">
                Value
              </th>
            </tr>
          </thead>
          <tbody>
            {user.recentClaims.map((claim) => (
              <tr key={claim.id}>
                <td className="text-text-3">{dateTime(claim.at)}</td>
                <td>
                  <Pill tone="neutral">{claim.source}</Pill>
                </td>
                <td className="text-text-2">{claim.label || '—'}</td>
                <td
                  className={cn(
                    'td-num tabular font-semibold',
                    claim.amount < 0 ? 'text-danger' : 'text-success',
                  )}
                >
                  {signedTokens(claim.amount)}
                </td>
                <td className="td-num tabular text-text-3">
                  {usd(Math.abs(claim.amount) * usdPerToken)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ---- WITHDRAWALS ---------------------------------------------------------- */

function WithdrawalsTab({ user }: UserDetailProps) {
  if (!user.withdrawals.length) {
    return (
      <EmptyState
        art="inbox"
        title="This account has never withdrawn"
        body="Requests appear here as soon as one is submitted, in every state including rejected."
      />
    );
  }

  return (
    <Card as="section">
      <CardHead>
        <div>
          <CardTitle>Withdrawal history</CardTitle>
          <CardSub>Every request, whatever its outcome</CardSub>
        </div>
      </CardHead>
      <div className="w-full overflow-auto">
        <table className="vf-table">
          <caption className="sr-only">Withdrawals for {user.username}</caption>
          <thead>
            <tr>
              <th scope="col">Requested</th>
              <th scope="col">Asset</th>
              <th scope="col" className="th-num">
                Sent
              </th>
              <th scope="col" className="th-num">
                Cost
              </th>
              <th scope="col">Destination</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {user.withdrawals.map((w) => (
              <tr key={w.id}>
                <td>
                  <span className="flex flex-col">
                    <span className="text-text-2">{shortDate(w.at)}</span>
                    <span className="font-mono text-11 text-text-3">{w.id}</span>
                  </span>
                </td>
                <td className="text-text-2">
                  {w.coin} · {w.rail}
                </td>
                <td className="td-num tabular">{cryptoAmount(Number(w.receiveAmount), w.coin)}</td>
                <td className="td-num tabular text-text-3">{tokens(w.tokenCost)}</td>
                <td>
                  <span className="flex flex-col">
                    <span className="font-mono text-12" title={w.address}>
                      {shortAddr(w.address)}
                    </span>
                    {w.txid ? (
                      <span className="font-mono text-11 text-text-3">{shortAddr(w.txid, 8, 6)}</span>
                    ) : null}
                  </span>
                </td>
                <td>
                  <span className="flex flex-col gap-1">
                    <StatusPill status={w.status} />
                    {w.failureReason ? (
                      <span className="text-11 text-danger">{w.failureReason}</span>
                    ) : null}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ---- REFERRALS ------------------------------------------------------------ */

function ReferralsTab({ user }: UserDetailProps) {
  const qualified = user.referrals.filter((r) => r.qualified).length;

  return (
    <div className="flex flex-col gap-5">
      <Card as="section">
        <CardHead>
          <div>
            <CardTitle>Referral standing</CardTitle>
            <CardSub>Tier and commission are written to the user document by the referral engine</CardSub>
          </div>
        </CardHead>
        <Kv
          rows={[
            ['Referral code', <code key="c" className="font-mono text-12">{user.referralCode || '—'}</code>],
            [
              'Invited by',
              user.referredBy ? (
                <Link
                  key="rb"
                  href={`/admin/users/${user.referredBy}`}
                  className="font-mono text-12 hover:text-mint"
                >
                  {user.referredBy}
                </Link>
              ) : (
                'joined directly'
              ),
            ],
            ['Tier', <Pill key="t" tone="violet">{user.referralTier}</Pill>],
            [
              'Commission',
              <span key="cm" className="font-mono tabular">
                {(user.commissionBps / 100).toFixed(2)}%
              </span>,
            ],
            [
              'Referrals',
              <span key="rc" className="font-mono tabular">
                {user.referralCount} counted · {qualified} qualified in the loaded page
              </span>,
            ],
          ]}
        />
      </Card>

      {user.referrals.length ? (
        <Card as="section">
          <CardHead>
            <CardTitle>Downline</CardTitle>
            <CardSub>Newest first, up to 50</CardSub>
          </CardHead>
          <div className="w-full overflow-auto">
            <table className="vf-table">
              <caption className="sr-only">Accounts referred by {user.username}</caption>
              <thead>
                <tr>
                  <th scope="col">Member</th>
                  <th scope="col" className="th-num">
                    Level
                  </th>
                  <th scope="col">Qualified</th>
                  <th scope="col">Joined</th>
                </tr>
              </thead>
              <tbody>
                {user.referrals.map((r) => (
                  <tr key={r.uid}>
                    <td>
                      <Link href={`/admin/users/${r.uid}`} className="font-semibold hover:text-mint">
                        {r.username}
                      </Link>
                    </td>
                    <td className="td-num tabular">{r.level}</td>
                    <td>
                      {r.qualified ? (
                        <Pill tone="success">qualified</Pill>
                      ) : (
                        <Pill tone="neutral">below threshold</Pill>
                      )}
                    </td>
                    <td className="text-text-3">{shortDate(r.joined)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Alert tone="info">
          No documents under <code className="font-mono">/referrals/{user.uid}/list</code>. The counter on
          the account reads {user.referralCount}.
        </Alert>
      )}
    </div>
  );
}

/* ---- SUPPORT -------------------------------------------------------------- */

function SupportTab({ user }: UserDetailProps) {
  if (!user.tickets.length) {
    return (
      <EmptyState
        art="success"
        title="This member has never opened a ticket"
        body="Tickets they open appear here with their status and last activity."
      />
    );
  }

  return (
    <Card as="section">
      <CardHead>
        <CardTitle>Tickets</CardTitle>
        <CardSub>Most recently updated first</CardSub>
      </CardHead>
      <div className="w-full overflow-auto">
        <table className="vf-table">
          <caption className="sr-only">Support tickets opened by {user.username}</caption>
          <thead>
            <tr>
              <th scope="col">Ticket</th>
              <th scope="col">Subject</th>
              <th scope="col">Status</th>
              <th scope="col">Updated</th>
            </tr>
          </thead>
          <tbody>
            {user.tickets.map((t) => (
              <tr key={t.id}>
                <td className="font-mono text-12">{t.id}</td>
                <td className="text-text-2">{t.subject || '—'}</td>
                <td>
                  <StatusPill status={t.status} />
                </td>
                <td className="text-text-3">{relative(t.updated)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ---- ACCOUNT ACTIONS ------------------------------------------------------ */

function ActionsTab({ user, role, perms }: UserDetailProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [reason, setReason] = React.useState('');
  const [until, setUntil] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [adjustReason, setAdjustReason] = React.useState('');
  const [typed, setTyped] = React.useState('');
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const call = async (action: string, payload: Record<string, unknown>, done: string) => {
    setBusy(action);
    setError(null);
    try {
      await api.post(`/api/admin/users/${user.uid}/${action}`, payload);
      toast(done, 'success');
      setReason('');
      setUntil('');
      setAmount('');
      setAdjustReason('');
      setTyped('');
      router.refresh();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'That did not go through.';
      setError(message);
      toast(message, 'danger');
    } finally {
      setBusy(null);
    }
  };

  const tokensDelta = Math.trunc(Number(amount) || 0);
  const confirmed = typed.trim() === user.username;

  return (
    <div className="flex flex-col gap-5">
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Card as="section">
        <CardHead>
          <div>
            <CardTitle>Account state</CardTitle>
            <CardSub>
              Suspension blocks earning and withdrawing. It does not touch the balance —{' '}
              {tokens(user.balance)} tokens stay on the account and stop moving.
            </CardSub>
          </div>
        </CardHead>

        <div className="flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-13 text-text-3">Current state</span>
            {user.suspended ? <Pill tone="danger">Suspended</Pill> : <Pill tone="success">Active</Pill>}
            {user.suspendedReason ? (
              <span className="text-12 text-text-3">Reason on file: {user.suspendedReason}</span>
            ) : null}
          </div>

          {!perms['user.suspend'] ? (
            <NoPermission role={role} what="change the account state" />
          ) : user.suspended ? (
            <div>
              <Button
                variant="secondary"
                disabled={busy !== null}
                onClick={() => call('unsuspend', {}, `${user.username} can earn and withdraw again.`)}
              >
                {busy === 'unsuspend' ? 'Lifting…' : 'Lift the suspension'}
              </Button>
              <p className="mt-2 text-11 text-text-3">
                Writes an audit row naming you as the actor. The member is not notified automatically.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <Field>
                <Label htmlFor="susp-reason">Reason</Label>
                <Input
                  id="susp-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Multi-accounting — three accounts on one device"
                />
                <Hint>Stored on the account and written to the audit log.</Hint>
              </Field>
              <Field>
                <Label htmlFor="susp-until">Until (optional)</Label>
                <Input
                  id="susp-until"
                  mono
                  type="date"
                  value={until}
                  onChange={(e) => setUntil(e.target.value)}
                />
                <Hint>Leave empty for an indefinite hold.</Hint>
              </Field>
              <div className="md:col-span-2">
                <Button
                  variant="danger"
                  disabled={busy !== null || reason.trim().length < 4}
                  onClick={() =>
                    call(
                      'suspend',
                      {
                        reason: reason.trim(),
                        ...(until ? { until: new Date(until).toISOString() } : {}),
                      },
                      `${user.username} is suspended.`,
                    )
                  }
                >
                  {busy === 'suspend' ? 'Suspending…' : 'Suspend this account'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
      <Card as="section">
        <CardHead>
          <div>
            <CardTitle>Manual balance adjustment</CardTitle>
            <CardSub>
              Goes through the ledger, so it appears in the member&apos;s own transaction history — the
              difference between a correction and a mystery.
            </CardSub>
          </div>
        </CardHead>

        <div className="p-5">
          {!perms['balance.adjust'] ? (
            <NoPermission role={role} what="credit or debit a balance" />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <Field>
                <Label htmlFor="adj-amount">Tokens</Label>
                <Input
                  id="adj-amount"
                  mono
                  type="number"
                  step={1}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="-500"
                />
                <Hint>
                  Negative debits. Capped at 1,000,000 per adjustment as a typo guard, not a permission.
                </Hint>
              </Field>

              <Field>
                <Label htmlFor="adj-reason">Reason</Label>
                <Input
                  id="adj-reason"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="Re-credit for a lost offerwall postback"
                />
                <Hint>Becomes the label on the row in the member&apos;s history.</Hint>
              </Field>

              <div className="md:col-span-2">
                {tokensDelta ? (
                  <p className="mb-3 text-13 text-text-2">
                    Balance goes from <span className="font-mono tabular">{tokens(user.balance)}</span> to{' '}
                    <span className="font-mono font-semibold tabular text-text">
                      {tokens(user.balance + tokensDelta)}
                    </span>{' '}
                    tokens.
                  </p>
                ) : null}
                <Field className="mb-3 max-w-xs">
                  <Label htmlFor="adj-confirm">
                    Type <span className="font-mono font-semibold text-text">{user.username}</span> to confirm
                  </Label>
                  <Input
                    id="adj-confirm"
                    mono
                    autoComplete="off"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                  />
                </Field>
                <Button
                  variant="danger"
                  disabled={busy !== null || !tokensDelta || adjustReason.trim().length < 4 || !confirmed}
                  onClick={() =>
                    call(
                      'adjust',
                      { tokens: tokensDelta, reason: adjustReason.trim() },
                      `${signedTokens(tokensDelta)} tokens applied to ${user.username}.`,
                    )
                  }
                >
                  {busy === 'adjust' ? 'Applying…' : 'Apply adjustment'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card as="section">
        <CardHead>
          <div>
            <CardTitle>Not available from this console</CardTitle>
            <CardSub>Named rather than shown as a disabled button that will never work</CardSub>
          </div>
        </CardHead>
        <div className="p-5 text-13 leading-body text-text-3">
          <p>
            Permanent bans, GDPR hard-deletes, password resets and 2FA disablement need Firebase Auth writes
            rather than Firestore writes, so they belong to a callable in{' '}
            <code className="font-mono text-12">functions/</code> and no route exposes them yet.
          </p>
          <p className="mt-2">
            Suspension is the reversible control that exists today, and it is the right first response to
            almost everything a moderator sees.
          </p>
        </div>
      </Card>
    </div>
  );
}
