import * as React from 'react';

import { cn } from '@/lib/utils';

/* ============================================================================
   SKELETON
   `.skel` carries the shimmer keyframe (globals.css) because the gradient
   needs a background-size larger than the element, which no utility expresses.
   Marked aria-hidden and paired with an sr-only "Loading" so a screen reader
   hears one announcement rather than N shimmering boxes.
   ========================================================================== */

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn('skel', className)} {...props} />;
}

export function SkeletonTable({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="p-5">
      <span className="sr-only" role="status">
        Loading table data
      </span>
      <div className="flex flex-col gap-3">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex gap-4">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className={cn('h-4 flex-1', c === 0 && 'max-w-[140px]')} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
