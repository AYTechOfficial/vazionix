'use client';

import * as React from 'react';

import { dateTime, nf, shortAddr } from '@/lib/format';
import type { OfferConversion } from '@/lib/models';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusPill } from '@/components/ui/Pill';

/**
 * Conversion history. Status leads because it is the only column a user opens
 * this page to check; the opaque provider conversion id is truncated, since its
 * only job is to be pasted into a support ticket.
 */
export function OfferHistoryTable({ rows }: { rows: OfferConversion[] }) {
  const columns: Array<Column<OfferConversion>> = [
    {
      id: 'status',
      header: 'Status',
      sortValue: (r) => r.status,
      cell: (r) => <StatusPill status={r.status} />,
    },
    { id: 'provider', header: 'Provider', sortValue: (r) => r.provider, cell: (r) => r.provider },
    {
      id: 'offer',
      header: 'Offer',
      cell: (r) => <span className="text-13 text-text-2">{r.offerName}</span>,
    },
    {
      id: 'reward',
      header: 'Reward',
      numeric: true,
      sortValue: (r) => r.reward,
      cell: (r) => (r.reward ? nf(r.reward) : <span className="text-text-3">—</span>),
    },
    {
      id: 'id',
      header: 'Conversion ID',
      cell: (r) => <span className="font-mono text-text-3">{shortAddr(r.id, 10, 6)}</span>,
    },
    {
      id: 'time',
      header: 'Time',
      numeric: true,
      sortValue: (r) => Date.parse(r.at),
      cell: (r) => <span className="text-12 text-text-3">{dateTime(r.at)}</span>,
    },
  ];

  return (
    <DataTable
      caption="Your offerwall conversions"
      columns={columns}
      rows={rows}
      getRowKey={(r) => r.id}
      initialSort={{ id: 'time', dir: 'desc' }}
      empty={
        <EmptyState
          title="No conversions yet"
          body="Complete an offer and it appears here as soon as the provider posts back — with a live credit status, including while it is still pending."
        />
      }
    />
  );
}
