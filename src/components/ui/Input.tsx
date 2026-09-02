'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

/* ============================================================================
   INPUT + FIELD SCAFFOLDING
   Validity is communicated three ways at once — border colour, `aria-invalid`,
   and a text message wired via `aria-describedby`. The live product validates
   nothing at all: you can submit an empty withdrawal address with no payout
   method selected and the confirm button stays enabled.
   ========================================================================== */

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  mono?: boolean;
  /** Reserve right padding for trailing actions inside <InputGroup>. */
  hasTrailing?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, mono = false, hasTrailing = false, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        'h-[42px] w-full rounded-sm border border-line bg-surface-2 px-4 text-14 text-text',
        'transition-[border-color,background-color] duration-fast ease-out',
        'placeholder:text-text-3 hover:border-line-strong',
        'focus:border-mint focus:bg-surface-1',
        'aria-[invalid=true]:border-danger',
        'disabled:cursor-not-allowed disabled:text-text-3',
        mono && 'font-mono text-13 tabular tracking-[-0.01em]',
        hasTrailing && 'pr-24',
        className,
      )}
      {...props}
    />
  );
});

export function Field({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-2', className)} {...props} />;
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-12 font-semibold text-text-2', className)} {...props} />;
}

export function Hint({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-12 text-text-3', className)} {...props} />;
}

export function FieldError({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn('flex items-center gap-[5px] text-12 text-danger', className)}
      {...props}
    />
  );
}

/** Input with trailing action(s): paste, MAX, unit addon. */
export function InputGroup({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('relative flex items-center', className)} {...props} />;
}

export function InputActions({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('absolute right-[6px] flex items-center gap-1', className)} {...props} />;
}

export function Addon({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('px-2 font-mono text-12 font-semibold text-text-3', className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'min-h-[92px] w-full resize-y rounded-sm border border-line bg-surface-2 px-4 py-3 text-14 leading-body text-text',
        'transition-[border-color,background-color] duration-fast ease-out',
        'placeholder:text-text-3 hover:border-line-strong focus:border-mint focus:bg-surface-1',
        className,
      )}
      {...props}
    />
  );
}
