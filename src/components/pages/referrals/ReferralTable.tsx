'use client';

import * as React from 'react';

import { dateTime, relative, tokens } from '@/lib/format';
import type { ReferralRow } from '@/lib/models';
import { CountryChip } from '@/components/ui/Avatar';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pill } from '@/components/ui/Pill';

/* ============================================================================
   REFERRAL TABLE
   ----------------------------------------------------------------------------
   WHY THIS IS ITS OWN CLIENT COMPONENT
   `DataTable` takes `columns`, and every column carries `sortValue` and `cell`
   FUNCTIONS. React cannot serialise a function across the server → client
   boundary, so building the column array in the Server Component and passing it
   down throws "Functions cannot be passed directly to Client Components" and the
   whole page renders the error boundary.

   The columns therefore live here, on the client, and the server passes only
   serialisable data: the rows and the commission rate for the empty state. This
   is the same shape as LedgerTable / WithdrawHistory / OfferHistoryTable.
   ========================================================================== */

const STATUS_TONE: Record<ReferralRow['status'], 'mint' | 'warning' | 'violet'> = {
  active: 'mint',
  idle: 'warning',
  dormant: 'violet',
};

const STATUS_LABEL: Record<ReferralRow['status'], string> = {
  active: 'Active',
  idle: 'Idle',
  dormant: 'Dormant',
};

export function ReferralTable({ rows, rate }: { rows: ReferralRow[]; rate: number }) {
  const columns = React.useMemo<Array<Column<ReferralRow>>>(
    () => [
      {
        id: 'user',
        header: 'Username',
        sortValue: (r) => r.username,
        cell: (r) => (
          <span className="flex items-center gap-2">
            <CountryChip code={r.countryCode} />
            <span className="text-text">{r.username}</span>
            {r.qualified ? <Pill tone="mint">Qualified</Pill> : null}
          </span>
        ),
      },
      {
        id: 'earned',
        header: 'Commission paid',
        numeric: true,
        sortValue: (r) => r.earned,
        cell: (r) => (r.earned ? tokens(r.earned) : <span className="text-text-3">—</span>),
      },
      { id: 'level', header: 'Level', numeric: true, sortValue: (r) => r.level, cell: (r) => r.level },
      {
        id: 'joined',
        header: 'Joined',
        sortValue: (r) => Date.parse(r.joined),
        cell: (r) => <span className="text-text-3">{dateTime(r.joined)}</span>,
      },
      {
        id: 'active',
        header: 'Last active',
        sortValue: (r) => Date.parse(r.lastActive),
        cell: (r) => (
          <Pill tone={STATUS_TONE[r.status]}>
            {STATUS_LABEL[r.status]} · {relative(r.lastActive)}
          </Pill>
        ),
      },
    ],
    [],
  );

  return (
    <DataTable
      caption="Everyone who joined with your referral link"
      columns={columns}
      rows={rows}
      getRowKey={(r) => r.uid}
      initialSort={{ id: 'joined', dir: 'desc' }}
      maxHeight={520}
      empty={
        <EmptyState
          art="inbox"
          title="No referrals yet"
          body={`Share the link above. You keep ${rate}% of everything they earn, for as long as they earn it.`}
        />
      }
    />
  );
}