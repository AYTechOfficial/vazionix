'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Download, Search } from 'lucide-react';

import { nf, relative, shortDate, tokens } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { CountryChip } from '@/components/ui/Avatar';
import { Input } from '@/components/ui/Input';
import { Pill } from '@/components/ui/Pill';
import { Select } from '@/components/ui/Select';
import { RiskMeter } from './RiskMeter';

/* ============================================================================
   USER MASTER TABLE
   ----------------------------------------------------------------------------
   Reads a page of `listUsers()` output. Everything that changes the result set —
   the search term, the suspended filter, the sort, the page — is a URL parameter
   handled by the server, because Firestore paging is cursor-based and a cursor
   cannot be reconstructed in the browser.

   PAGING IS A TRAIL, NOT A PAGE NUMBER
   `startAfter(doc)` only goes forward. `offset` would go backward but Firestore
   bills every skipped document, so page 40 of this table would cost forty pages of
   reads. So "Previous" is implemented by carrying the trail of cursors already
   visited in the URL and popping the last one. It is exact, it costs one page of
   reads, and it degrades to "Start over" when the trail is empty.

   THE SEARCH BOX IS A PREFIX SEARCH AND SAYS SO
   `listUsers` does a range scan on `usernameLower` plus an exact email match.
   Firestore has no substring index, so a box that implied `contains` would silently
   miss results — which is worse than a box that states its limit.

   CSV EXPORT covers the rows on screen and is prefixed with a UTF-8 BOM; without
   it Excel on Windows opens the file as Latin-1 and every non-ASCII username is
   mojibake, which for this user base is a large fraction of the file. It is a
   browser-side export, so it writes no audit row — noted rather than pretended.
   ========================================================================== */

export interface UserRow {
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
}

const SORTS = [
  { value: 'createdAt', label: 'Newest first' },
  { value: 'balance', label: 'Highest balance' },
  { value: 'totalEarned', label: 'Most earned' },
  { value: 'level', label: 'Highest level' },
] as const;

export function UsersTable({
  rows,
  total,
  nextCursor,
  trail,
  search,
  suspended,
  sort,
  canExport,
}: {
  rows: UserRow[];
  total: number;
  /** Cursor that fetches the NEXT page, or null when this is the last one. */
  nextCursor: string | null;
  /** Cursors consumed by earlier pages, oldest first. Drives "Previous". */
  trail: string[];
  search: string;
  suspended: 'all' | 'yes' | 'no';
  sort: string;
  /** `user.export`, resolved server-side. */
  canExport: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [term, setTerm] = React.useState(search);

  /** The cursor that produced the page on screen. Null on the first page. */
  const current = params.get('cursor');
  const pageNumber = trail.length + (current ? 2 : 1);

  /** Rebuild the query string. Any change to the result set resets the trail —
      a cursor from the previous filter points into a different ordering. */
  const go = (patch: Record<string, string | null>, keepTrail = false) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    }
    if (!keepTrail) {
      next.delete('cursor');
      next.delete('trail');
    }
    router.push(`${pathname}?${next.toString()}`);
  };

  const nextPage = () => {
    if (!nextCursor) return;
    const grown = current ? [...trail, current] : trail;
    go({ cursor: nextCursor, trail: grown.join(',') || null }, true);
  };

  const prevPage = () => {
    const copy = [...trail];
    const back = copy.pop() ?? null;
    go({ cursor: back, trail: copy.join(',') || null }, true);
  };

  const exportCsv = () => {
    const cols = [
      'uid', 'username', 'email', 'countryCode', 'level', 'balance', 'lockedBalance',
      'totalEarned', 'referralCount', 'suspended', 'emailVerified', 'createdAt',
      'lastSeenAt', 'riskScore',
    ] as const;
    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    // ﻿ — the BOM referenced in the header comment.
    const csv = `﻿${[cols.join(','), ...rows.map((r) => cols.map((c) => escape(r[c])).join(','))].join('\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `vazionix-users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="rounded-md border border-line bg-surface-1">
      <form
        className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          go({ q: term.trim() || null });
        }}
      >
        <div className="relative flex min-w-[240px] flex-1 items-center">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 size-4 text-text-3" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Username prefix, or a full email address"
            aria-label="Search users"
            className="pl-9"
          />
        </div>

        <Select
          value={suspended}
          aria-label="Filter by account state"
          onChange={(e) => go({ suspended: e.target.value === 'all' ? null : e.target.value })}
        >
          <option value="all">Every account</option>
          <option value="no">Active only</option>
          <option value="yes">Suspended only</option>
        </Select>

        <Select value={sort} aria-label="Sort" onChange={(e) => go({ sort: e.target.value })}>
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>

        <Button type="submit" variant="secondary" size="sm">
          Search
        </Button>

        {search ? (
          <Button variant="ghost" size="sm" onClick={() => { setTerm(''); go({ q: null }); }}>
            Clear
          </Button>
        ) : null}

        <span className="text-12 text-text-3">
          {search ? `${nf(rows.length)} on this page` : `${nf(total)} accounts`}
        </span>

        {canExport ? (
          <Button variant="secondary" size="sm" onClick={exportCsv} disabled={!rows.length}>
            <Download aria-hidden="true" />
            Export page
          </Button>
        ) : null}
      </form>

      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-13 text-text-3">
          {search
            ? 'No account matches that. The search is a username prefix or an exact email — Firestore has no substring index.'
            : 'No documents in /users yet. The first record appears when somebody registers.'}
        </p>
      ) : (
        <div className="w-full overflow-auto">
          <table className="vf-table">
            <caption className="sr-only">Platform users with balance, level, activity and risk</caption>
            <thead>
              <tr>
                <th scope="col">User</th>
                <th scope="col">Country</th>
                <th scope="col" className="th-num">
                  Balance
                </th>
                <th scope="col" className="th-num">
                  Earned
                </th>
                <th scope="col" className="th-num">
                  Level
                </th>
                <th scope="col">Joined</th>
                <th scope="col">Last seen</th>
                <th scope="col">State</th>
                <th scope="col" className="th-num">
                  Risk
                </th>
                <th scope="col">
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.uid}>
                  <td>
                    <Link href={`/admin/users/${u.uid}`} className="flex items-center gap-2">
                      <span className="grid size-[26px] flex-none place-items-center rounded-sm bg-surface-3 font-mono text-[10px] font-bold text-text-2">
                        {u.username.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="font-semibold text-text">{u.username}</span>
                        <span className="truncate text-11 text-text-3">{u.email || '—'}</span>
                      </span>
                    </Link>
                  </td>
                  <td>
                    <CountryChip code={u.countryCode} />
                  </td>
                  <td className="td-num tabular">
                    <span className="flex flex-col items-end">
                      <span>{tokens(u.balance)}</span>
                      {u.lockedBalance ? (
                        <span className="text-11 text-text-3">{tokens(u.lockedBalance)} locked</span>
                      ) : null}
                    </span>
                  </td>
                  <td className="td-num tabular text-text-3">{tokens(u.totalEarned)}</td>
                  <td className="td-num tabular">{u.level}</td>
                  <td className="text-text-3">{shortDate(u.createdAt)}</td>
                  <td className="text-text-3">{relative(u.lastSeenAt)}</td>
                  <td>
                    <span className="flex flex-wrap gap-1">
                      {u.suspended ? (
                        <Pill tone="danger">Suspended</Pill>
                      ) : (
                        <Pill tone="success">Active</Pill>
                      )}
                      {u.emailVerified ? null : <Pill tone="warning">Unverified</Pill>}
                    </span>
                  </td>
                  <td className="td-num">
                    <RiskMeter score={u.riskScore} />
                  </td>
                  <td>
                    <Link
                      href={`/admin/users/${u.uid}`}
                      aria-label={`Open ${u.username}`}
                      className="inline-grid size-[26px] place-items-center rounded-sm text-text-3 hover:bg-surface-3 hover:text-text"
                    >
                      <ChevronRight aria-hidden="true" className="size-[14px]" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
        <span className="text-12 text-text-3">
          {search
            ? 'Search results are a single page — refine the prefix to narrow them.'
            : `Page ${pageNumber} · cursor paging, one page of reads per click`}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" disabled={!current || Boolean(search)} onClick={prevPage}>
            <ChevronLeft aria-hidden="true" />
            Previous
          </Button>
          <Button variant="ghost" size="sm" disabled={!nextCursor || Boolean(search)} onClick={nextPage}>
            Next
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </div>
    </section>
  );
}
