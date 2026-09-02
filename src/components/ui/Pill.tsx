import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { CheckCircle2, Clock, RefreshCw, XCircle, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

/* ============================================================================
   PILL
   Small, dense status chip. Never taller than 22px so it can sit inline in a
   34px table row without changing row height.
   ========================================================================== */

export const pillVariants = cva(
  'inline-flex h-[22px] items-center gap-[5px] whitespace-nowrap rounded-sm border px-2 text-11 font-semibold tracking-[0.01em] [&_svg]:size-[11px] [&_svg]:flex-none',
  {
    variants: {
      tone: {
        neutral: 'border-line bg-neutral-dim text-text-2',
        mint: 'border-line-accent bg-mint-dim text-mint',
        success: 'border-success-line bg-success-dim text-success',
        warning: 'border-warning-line bg-warning-dim text-warning',
        danger: 'border-danger-line bg-danger-dim text-danger',
        info: 'border-info-line bg-info-dim text-info',
        violet: 'border-violet-line bg-violet-dim text-violet-text',
        blue: 'border-line bg-blue-dim text-blue-text',
        sponsor: 'border-sponsor-line bg-sponsor-dim text-sponsor',
      },
      size: { sm: '', lg: 'h-[26px] px-3 text-12' },
    },
    defaultVariants: { tone: 'neutral', size: 'sm' },
  },
);

export interface PillProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof pillVariants> {
  icon?: LucideIcon;
}

export function Pill({ className, tone, size, icon: Icon, children, ...props }: PillProps) {
  return (
    <span className={cn(pillVariants({ tone, size }), className)} {...props}>
      {Icon ? <Icon aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

/* ---- STATUS PILL -----------------------------------------------------------
   Status pills ALWAYS carry an icon plus text. Colour is never the only
   signal — that is the rule the live product breaks with its red "Empty
   balance" chips, which encode "you can't do this" purely in hue.        */

export type StatusValue =
  | 'Completed' | 'Processing' | 'Pending' | 'Rejected'
  | 'Approved' | 'Active' | 'Paused' | 'Suspended'
  | 'Open' | 'Answered' | 'Closed'
  | 'Credited' | 'Failed'
  | 'Won' | 'Lost';

const STATUS_MAP: Record<StatusValue, { tone: NonNullable<PillProps['tone']>; icon: LucideIcon }> = {
  Completed:  { tone: 'success', icon: CheckCircle2 },
  Approved:   { tone: 'success', icon: CheckCircle2 },
  Credited:   { tone: 'success', icon: CheckCircle2 },
  Won:        { tone: 'success', icon: CheckCircle2 },
  Active:     { tone: 'mint',    icon: CheckCircle2 },
  Processing: { tone: 'info',    icon: RefreshCw },
  Open:       { tone: 'info',    icon: Clock },
  Answered:   { tone: 'mint',    icon: CheckCircle2 },
  /* An unknown or in-flight state is NEVER red. Danger is reserved for
     "we are stopping you". */
  Pending:    { tone: 'warning', icon: Clock },
  Paused:     { tone: 'warning', icon: Clock },
  Rejected:   { tone: 'danger',  icon: XCircle },
  Failed:     { tone: 'danger',  icon: XCircle },
  Suspended:  { tone: 'danger',  icon: XCircle },
  Lost:       { tone: 'neutral', icon: XCircle },
  Closed:     { tone: 'neutral', icon: CheckCircle2 },
};

export function StatusPill({ status, className }: { status: StatusValue | string; className?: string }) {
  const entry = STATUS_MAP[status as StatusValue] ?? STATUS_MAP.Pending;
  return (
    <Pill tone={entry.tone} icon={entry.icon} className={className}>
      {status}
    </Pill>
  );
}
