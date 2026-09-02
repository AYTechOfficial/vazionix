import * as React from 'react';

import { cn } from '@/lib/utils';

/* ============================================================================
   CARD
   Depth in dark UI comes from lightening the surface plus a 1px hairline.
   Drop shadows are invisible on near-black and are therefore not used for
   in-page elevation — only for true overlays (menus, modals, toasts).
   ========================================================================== */

export interface CardProps extends React.HTMLAttributes<HTMLElement> {
  /** Render as <section>/<article> etc. so pages keep real landmarks. */
  as?: 'div' | 'section' | 'article' | 'aside';
  /** Convenience padding for cards with no head/body split. */
  pad?: false | 'md' | 'lg';
  hover?: boolean;
}

export function Card({ as: Tag = 'div', pad = false, hover = false, className, ...props }: CardProps) {
  return (
    <Tag
      className={cn(
        'relative rounded-md border border-line bg-surface-1',
        pad === 'md' && 'p-5',
        pad === 'lg' && 'p-6',
        hover &&
          'transition-[border-color,background-color] duration-base ease-out hover:border-line-strong hover:bg-surface-2',
        className,
      )}
      {...props}
    />
  );
}

export function CardHead({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex items-center justify-between gap-4 border-b border-line px-5 py-4', className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('text-14 font-semibold tracking-[-0.01em] text-text', className)} {...props} />;
}

/** The 11px caption that sits under a card title. */
export function CardSub({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('text-11 text-text-3', className)} {...props} />;
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...props} />;
}

export function CardFoot({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('border-t border-line px-5 py-3', className)} {...props} />;
}

/** 1px rule. A real element rather than a border so it can sit inside a flex
    stack without collapsing margins. */
export function Divider({ className, ...props }: React.HTMLAttributes<HTMLHRElement>) {
  return <hr className={cn('h-px border-0 bg-line', className)} {...props} />;
}
