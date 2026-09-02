'use client';

import * as React from 'react';
import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';

/* ============================================================================
   CHECKBOX
   ========================================================================== */

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  children?: React.ReactNode;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, children, ...props },
  ref,
) {
  return (
    <label className={cn('inline-flex cursor-pointer items-start gap-3 text-13 text-text-2', className)}>
      <input ref={ref} type="checkbox" className="peer absolute size-0 opacity-0" {...props} />
      <span
        aria-hidden="true"
        className={cn(
          'mt-px grid size-[18px] flex-none place-items-center rounded-[5px] border-[1.5px] border-line-strong bg-surface-2',
          'transition-[background-color,border-color] duration-fast ease-out',
          'peer-checked:border-mint peer-checked:bg-mint',
          'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus',
          '[&>svg]:scale-[0.6] [&>svg]:opacity-0 [&>svg]:transition-all [&>svg]:duration-fast [&>svg]:ease-spring',
          'peer-checked:[&>svg]:scale-100 peer-checked:[&>svg]:opacity-100',
        )}
      >
        <Check className="size-3 text-text-on-mint" strokeWidth={3} />
      </span>
      {children ? <span className="min-w-0">{children}</span> : null}
    </label>
  );
});
