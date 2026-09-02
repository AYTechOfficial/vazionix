import * as React from 'react';

import { cn } from '@/lib/utils';

/* ============================================================================
   TOOLTIP
   A CSS tooltip driven by `data-tip` + the `.tip` class (globals.css) rather
   than a portal + positioning engine. Reasoning: every tooltip in this product
   is a short, static label on a control that never sits near a viewport edge
   except in the collapsed sidebar rail — which gets `.tip-right`. A floating
   library for that is ~15KB and an extra render pass per hover.

   It is keyboard-reachable (`:focus-visible` shows it), and because the text
   lives in an attribute rather than a rendered node it never traps a
   screen-reader cursor — the accessible name comes from `aria-label`/`title`
   on the wrapped control, which callers must still provide.
   ========================================================================== */

export interface TooltipProps extends React.HTMLAttributes<HTMLSpanElement> {
  tip: string;
  /** Flip to the right of the trigger (collapsed sidebar rail). */
  side?: 'top' | 'right';
  children: React.ReactNode;
}

export function Tooltip({ tip, side = 'top', className, children, ...props }: TooltipProps) {
  return (
    <span
      data-tip={tip}
      className={cn('tip inline-flex', side === 'right' && 'tip-right', className)}
      {...props}
    >
      {children}
    </span>
  );
}

/** The small ⓘ affordance used beside stat labels. Carries its own accessible
    name so the tooltip text is not the only way to reach the information. */
export function InfoHint({ tip, className }: { tip: string; className?: string }) {
  return (
    <span
      data-tip={tip}
      tabIndex={0}
      role="note"
      aria-label={tip}
      className={cn(
        'tip grid size-[14px] place-items-center rounded-full border border-line text-[9px] font-bold text-text-3',
        'transition-colors duration-fast ease-out hover:border-line-strong hover:text-text-2',
        className,
      )}
    >
      <span aria-hidden="true">i</span>
    </span>
  );
}
