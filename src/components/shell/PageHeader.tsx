import * as React from 'react';

import { cn } from '@/lib/utils';

/* ============================================================================
   PAGE HEADER
   Every page opens the same way: an <h1>, one line of orienting sub-copy, and
   the page's primary actions on the right. The live product has no consistent
   page header at all — some pages open with an ad, some with a KPI row, some
   with nothing.
   ========================================================================== */

export function PageHeader({
  title,
  sub,
  actions,
  className,
}: {
  title: string;
  sub?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-5 flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        <h2 className="text-24 font-semibold tracking-snug">{title}</h2>
        {sub ? <p className="mt-0.5 text-13 text-text-3">{sub}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function SectionTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-16 font-semibold tracking-[-0.01em]', className)} {...props} />;
}
