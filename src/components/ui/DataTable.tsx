'use client';

import * as React from 'react';
import { ChevronDown, ChevronsUpDown, ChevronUp } from 'lucide-react';

import { cn } from '@/lib/utils';

/* ============================================================================
   DATA TABLE
   ----------------------------------------------------------------------------
   One table component for every tabular surface in the product. It owns three
   behaviours the live product has none of:

   1. SORTING — click or Enter/Space on a header, with `aria-sort` announced.
      Sorting is by an explicit `sortValue`, never by the rendered string, so
      "1.28M" and "8,420" order numerically rather than lexicographically.
   2. STICKY HEADER — the header stays put inside a scrolling wrapper, which is
      what makes a 200-row leaderboard readable at all.
   3. PINNED "YOU" ROW — the viewer's own row sticks to the bottom of the
      viewport when it is off-screen. The live leaderboard reports your rank as
      11px grey footer text 900px below the board you are reading.

   Colour is never the only marker for the "you" row: it also carries a left
   rule and a visible "You" badge.
   ========================================================================== */

export interface Column<T> {
  /** Stable key; also used for the sort state. */
  id: string;
  header: React.ReactNode;
  /** Cell renderer. Return a node, not a string, so cells can be rich. */
  cell: (row: T, index: number) => React.ReactNode;
  /** Right-aligned mono numeric column. */
  numeric?: boolean;
  /** Provide to make the column sortable. */
  sortValue?: (row: T) => number | string;
  headerClassName?: string;
  cellClassName?: string;
  /** Screen-reader-only header text when `header` is an icon or blank. */
  srHeader?: string;
}

export type SortDirection = 'asc' | 'desc';

export interface DataTableProps<T> {
  columns: Array<Column<T>>;
  rows: T[];
  getRowKey: (row: T, index: number) => React.Key;
  /** Marks the viewer's own row for tinting + the "You" badge. */
  isYou?: (row: T) => boolean;
  /** Rendered sticky at the bottom when the viewer is not in `rows`. */
  pinnedRow?: T | null;
  caption: string;
  initialSort?: { id: string; dir: SortDirection };
  comfortable?: boolean;
  empty?: React.ReactNode;
  className?: string;
  /** Max height for the scroll container; enables the sticky header. */
  maxHeight?: number | string;
}

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  isYou,
  pinnedRow = null,
  caption,
  initialSort,
  comfortable = false,
  empty,
  className,
  maxHeight,
}: DataTableProps<T>) {
  const [sort, setSort] = React.useState<{ id: string; dir: SortDirection } | null>(initialSort ?? null);

  const sorted = React.useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.id === sort.id);
    if (!col?.sortValue) return rows;
    const getValue = col.sortValue;
    const factor = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = getValue(a);
      const bv = getValue(b);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor;
      return String(av).localeCompare(String(bv), 'en') * factor;
    });
  }, [rows, sort, columns]);

  const toggleSort = (col: Column<T>) => {
    if (!col.sortValue) return;
    setSort((prev) => {
      if (prev?.id !== col.id) return { id: col.id, dir: col.numeric ? 'desc' : 'asc' };
      if (prev.dir === 'desc') return { id: col.id, dir: 'asc' };
      return null; // third click clears — back to the source order
    });
  };

  if (!rows.length && empty) {
    return <div className={className}>{empty}</div>;
  }

  return (
    <div
      className={cn('w-full overflow-auto', className)}
      style={maxHeight ? { maxHeight } : undefined}
    >
      <table className={cn('vf-table', comfortable && 'vf-table--comfortable')}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((col) => {
              const active = sort?.id === col.id;
              const ariaSort = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
              return (
                <th
                  key={col.id}
                  scope="col"
                  aria-sort={col.sortValue ? ariaSort : undefined}
                  className={cn(col.numeric && 'th-num', col.headerClassName)}
                >
                  {col.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(col)}
                      className={cn(
                        'inline-flex select-none items-center gap-1 uppercase tracking-wide transition-colors duration-fast ease-out hover:text-text-2',
                        col.numeric && 'flex-row-reverse',
                        active && 'text-text-2',
                      )}
                    >
                      {col.header}
                      <SortMark active={active} dir={sort?.dir} />
                      {col.srHeader ? <span className="sr-only">{col.srHeader}</span> : null}
                    </button>
                  ) : (
                    <>
                      {col.header}
                      {col.srHeader ? <span className="sr-only">{col.srHeader}</span> : null}
                    </>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr key={getRowKey(row, i)} className={cn(isYou?.(row) && 'tr-you')}>
              {columns.map((col) => (
                <td key={col.id} className={cn(col.numeric && 'td-num tabular', col.cellClassName)}>
                  {col.cell(row, i)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {pinnedRow ? (
          <tfoot>
            <tr className="tr-you tr-pinned">
              {columns.map((col) => (
                <td key={col.id} className={cn(col.numeric && 'td-num tabular', col.cellClassName)}>
                  {col.cell(pinnedRow, -1)}
                </td>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

function SortMark({ active, dir }: { active: boolean; dir?: SortDirection }) {
  const Icon = !active ? ChevronsUpDown : dir === 'asc' ? ChevronUp : ChevronDown;
  return (
    <Icon
      aria-hidden="true"
      className={cn('size-3 flex-none', active ? 'text-mint opacity-100' : 'opacity-35')}
    />
  );
}

/** Small square rank badge. 1/2/3 get metallic ramps; the rest are neutral. */
export function RankBadge({ rank }: { rank: number | null }) {
  if (rank === null) {
    return (
      <span className="inline-grid size-[22px] place-items-center rounded-sm bg-surface-3 font-mono text-11 font-semibold text-text-3">
        —
      </span>
    );
  }
  const medal = rank >= 1 && rank <= 3 ? rank : null;
  return (
    <span
      className="inline-grid size-[22px] place-items-center rounded-sm bg-surface-3 font-mono text-11 font-semibold tabular text-text-2"
      style={
        medal
          ? { background: `var(--rank-${medal})`, color: `var(--rank-${medal}-ink)` }
          : undefined
      }
    >
      {rank}
    </span>
  );
}
