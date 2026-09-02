'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

/* ============================================================================
   SWITCH
   A visually-hidden real <input type="checkbox"> rather than a
   div-with-role="switch": it is focusable, form-associated, and works with
   label clicks and browser autofill with no extra code.
   ========================================================================== */

export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: React.ReactNode;
  /** Render "On"/"Off" beside the track. */
  showState?: boolean;
}

export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { className, label, showState = false, checked, defaultChecked, ...props },
  ref,
) {
  const [internal, setInternal] = React.useState(Boolean(defaultChecked));
  const isControlled = checked !== undefined;
  const on = isControlled ? Boolean(checked) : internal;

  return (
    <label className={cn('group inline-flex cursor-pointer items-center gap-3', className)}>
      <input
        ref={ref}
        type="checkbox"
        className="peer absolute size-0 opacity-0"
        checked={isControlled ? checked : internal}
        onChange={(e) => {
          if (!isControlled) setInternal(e.currentTarget.checked);
          props.onChange?.(e);
        }}
        {...props}
      />
      <span
        aria-hidden="true"
        className={cn(
          'relative h-[22px] w-[38px] flex-none rounded-full border transition-colors duration-base ease-out',
          'after:absolute after:left-[2px] after:top-[2px] after:size-4 after:rounded-full',
          'after:transition-[transform,background-color] after:duration-base after:ease-spring',
          on
            ? 'border-mint bg-mint after:translate-x-4 after:bg-text-inverse'
            : 'border-line-strong bg-surface-3 after:translate-x-0 after:bg-text-2',
          'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus',
        )}
      />
      {label ? <span className="text-13 text-text-2">{label}</span> : null}
      {showState ? (
        <span className="min-w-6 text-12 font-semibold text-text-3">{on ? 'On' : 'Off'}</span>
      ) : null}
    </label>
  );
});
