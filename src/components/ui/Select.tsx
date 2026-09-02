'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';

/* ============================================================================
   SELECT
   A real <select>. A custom listbox would need to re-implement type-ahead,
   mobile native pickers, form association and touch scroll momentum, and the
   only thing it buys here is a styled option row. The chevron is a rendered
   icon rather than a base64 SVG background so it inherits `currentColor` and
   flips with the theme for free.
   ========================================================================== */

/** `size` is overridden: the native numeric `size` (visible rows) is never
    used here, and the name is worth more as a scale token. */
export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  size?: 'sm' | 'md';
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, children, size = 'md', ...props },
  ref,
) {
  return (
    <span className="relative inline-flex items-center">
      <select
        ref={ref}
        className={cn(
          'peer w-full appearance-none rounded-sm border border-line bg-surface-2 pl-3 pr-8 text-text',
          'transition-colors duration-fast ease-out hover:border-line-strong',
          'focus:border-mint',
          size === 'sm' ? 'h-[26px] text-11' : 'h-[34px] text-13',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-[10px] size-3 text-text-3 peer-hover:text-text-2"
      />
    </span>
  );
});
