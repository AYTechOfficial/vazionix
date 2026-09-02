'use client';

import * as React from 'react';
import { Check, Coins, Ticket } from 'lucide-react';

import { dateTime, nf, tokens } from '@/lib/format';
import { ApiError, endpoints } from '@/lib/api';
import type { CouponRow } from '@/lib/models';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, Input, Label } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/components/providers/SessionProvider';

/* ============================================================================
   COUPON REDEMPTION
   ----------------------------------------------------------------------------
   The code is the document id in `/coupons`, upper-cased, so redemption is one
   read and two coupons cannot share a code. The per-user marker and the
   redemption counter both move inside the same transaction as the credit, which
   is what makes "one per user" hold when the same person submits twice at once.
   ========================================================================== */

export function CouponPanel({ initial }: { initial: CouponRow[] }) {
  const [rows, setRows] = React.useState(initial);
  const [code, setCode] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const { applyClaim, setProfile } = useSession();
  const { toast } = useToast();

  const redeem = async () => {
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);

    try {
      const response = await endpoints.redeemCoupon(code.trim());
      setRows(response.redemptions);
      setResult(response.message);
      setCode('');
      if (response.tokens > 0) applyClaim(response.tokens, response.message);
      else toast(response.message, 'success');
      if (response.profile) setProfile(response.profile);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not redeem that code.');
    } finally {
      setBusy(false);
    }
  };

  const columns: Array<Column<CouponRow>> = [
    { id: 'code', header: 'Code', sortValue: (r) => r.code, cell: (r) => <span className="font-mono">{r.code}</span> },
    {
      id: 'tokens',
      header: 'Tokens',
      numeric: true,
      sortValue: (r) => r.balance,
      cell: (r) => (r.balance ? tokens(r.balance) : <span className="text-text-3">—</span>),
    },
    { id: 'label', header: 'Detail', cell: (r) => <span className="text-13 text-text-2">{r.discount}</span> },
    {
      id: 'at',
      header: 'Redeemed',
      numeric: true,
      sortValue: (r) => Date.parse(r.at),
      cell: (r) => <span className="text-12 text-text-3">{dateTime(r.at)}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <Card as="section">
        <CardHead>
          <div className="min-w-0">
            <CardTitle>Redeem a code</CardTitle>
            <CardSub>Codes are case-insensitive and single-use per account</CardSub>
          </div>
        </CardHead>
        <CardBody>
          <div className="flex flex-wrap items-end gap-3">
            <Field className="min-w-[220px] flex-1">
              <Label htmlFor="coupon-code">Coupon code</Label>
              <Input
                id="coupon-code"
                mono
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void redeem();
                }}
                placeholder="WELCOME2026"
                aria-invalid={Boolean(error)}
              />
            </Field>
            <Button variant="primary" onClick={redeem} disabled={busy || !code.trim()}>
              <Ticket aria-hidden="true" />
              {busy ? 'Checking…' : 'Redeem'}
            </Button>
          </div>

          {result ? (
            <Alert tone="success" icon={Check} className="mt-4">
              {result}
            </Alert>
          ) : null}

          {error ? (
            <Alert tone="danger" className="mt-4 text-12">
              {error}
            </Alert>
          ) : null}
        </CardBody>
      </Card>

      <Card as="section">
        <CardHead>
          <div className="min-w-0">
            <CardTitle>Your redemptions</CardTitle>
            <CardSub>{rows.length ? `${nf(rows.length)} total` : 'None yet'}</CardSub>
          </div>
        </CardHead>
        <DataTable
          caption="Coupons you have redeemed"
          columns={columns}
          rows={rows}
          getRowKey={(r) => r.id}
          initialSort={{ id: 'at', dir: 'desc' }}
          empty={
            <EmptyState
              art="inbox"
              title="No coupons redeemed"
              body="Codes appear in announcements and on our social accounts. Every redemption is recorded here and in Transactions."
            />
          }
        />
      </Card>

      <p className="flex items-start gap-2 text-11 leading-body text-text-3">
        <Coins aria-hidden="true" className="mt-[2px] size-3 flex-none" />
        A coupon credits tokens to your earning balance, advertiser credit to your deposit balance, or both. The
        exact split is shown when you redeem it.
      </p>
    </div>
  );
}
