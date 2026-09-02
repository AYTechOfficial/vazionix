import * as React from 'react';
import { Database } from 'lucide-react';

import { cn } from '@/lib/utils';

/* ============================================================================
   NOT CONFIGURED
   ----------------------------------------------------------------------------
   The honest empty state for a console screen whose backing collection has no
   documents yet. It names the Firestore path, says which action creates the first
   record, and stops.

   This replaces a marker component that used to say "specified in the prototype".
   The difference matters: an operator reading this one learns what to do next,
   and nobody can mistake it for data.
   ========================================================================== */

export function NotConfigured({
  what,
  collection,
  how,
  className,
}: {
  /** What this screen shows, in plain words: "Withdrawal reversals". */
  what: string;
  /** The Firestore path that drives it: "/reversals". */
  collection: string;
  /** How the first record gets created. */
  how: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label="No data yet"
      className={cn('rounded-md border border-dashed border-line-strong bg-surface-1 p-5', className)}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-8 flex-none place-items-center rounded-sm border border-line bg-surface-2 text-text-3">
          <Database aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-14 font-semibold text-text">{what} — nothing recorded yet</h3>
          <p className="mt-1 max-w-prose text-13 leading-body text-text-3">
            This screen reads{' '}
            <code className="rounded-[4px] bg-surface-inset px-1 py-0.5 font-mono text-12">{collection}</code>,
            which is empty. {how}
          </p>
        </div>
      </div>
    </section>
  );
}
