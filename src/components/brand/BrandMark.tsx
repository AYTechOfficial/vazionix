import * as React from 'react';
import Link from 'next/link';

import { cn } from '@/lib/utils';
import { brand } from '@/lib/brand';

/* ============================================================================
   BRAND MARK
   ----------------------------------------------------------------------------
   The Vazionix mark: a "V" cut from a rising stroke, drawn rather than imported,
   so it scales to any size, retints with the theme, and adds nothing to the
   bundle. One component means the mark cannot drift between the auth pages, the
   sidebar and the landing header.
   ========================================================================== */

export function BrandMark({
  size = 30,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn('grid flex-none place-items-center rounded-[9px] bg-grad-signature text-on-grad', className)}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3) }}
    >
      <svg viewBox="0 0 24 24" fill="none" style={{ width: size * 0.6, height: size * 0.6 }}>
        {/* The V. */}
        <path
          d="M4 4.5 11 19.5 18 4.5"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* The rising stroke that turns the V into a mark rather than a letter. */}
        <path d="M14.5 10.5 21 4.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    </span>
  );
}

/** Mark plus wordmark, linking home. Used in the auth shell and landing header. */
export function BrandLock({
  href = '/',
  size = 30,
  className,
}: {
  href?: string;
  size?: number;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn('inline-flex items-center gap-3', className)}
      aria-label={`${brand.name} home`}
    >
      <BrandMark size={size} />
      <span className="font-display text-16 font-bold tracking-[-0.03em]">{brand.name}</span>
    </Link>
  );
}
