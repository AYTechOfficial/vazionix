import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

/* ============================================================================
   ALERT
   Inline, in-flow explanation. Not a toast: an alert states a standing fact
   about the screen, a toast reports something that just happened.
   ========================================================================== */

const alertVariants = cva('flex items-start gap-3 rounded-sm border px-4 py-3 text-13 text-text-2', {
  variants: {
    tone: {
      info: 'border-info-line bg-info-dim [&>svg]:text-info',
      success: 'border-success-line bg-success-dim [&>svg]:text-success',
      warning: 'border-warning-line bg-warning-dim [&>svg]:text-warning',
      danger: 'border-danger-line bg-danger-dim [&>svg]:text-danger',
    },
  },
  defaultVariants: { tone: 'info' },
});

const TONE_ICON: Record<'info' | 'success' | 'warning' | 'danger', LucideIcon> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
};

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  icon?: LucideIcon;
}

export function Alert({ className, tone = 'info', icon, children, ...props }: AlertProps) {
  const Icon = icon ?? TONE_ICON[tone ?? 'info'];
  return (
    <div className={cn(alertVariants({ tone }), '[&_strong]:font-semibold [&_strong]:text-text', className)} {...props}>
      <Icon aria-hidden="true" className="mt-px size-4 flex-none" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}
