import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/* ============================================================================
   AVATAR + COUNTRY CHIP
   ========================================================================== */

const avatarVariants = cva(
  'grid flex-none place-items-center rounded-full border border-line-strong bg-grad-signature font-bold tracking-[-0.02em] text-on-grad',
  {
    variants: {
      size: {
        sm: 'size-[22px] text-[9px]',
        md: 'size-7 text-11',
        lg: 'size-11 text-14',
        xl: 'size-16 text-20',
      },
    },
    defaultVariants: { size: 'md' },
  },
);

export interface AvatarProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof avatarVariants> {
  initials: string;
}

export function Avatar({ initials, size, className, ...props }: AvatarProps) {
  return (
    <span aria-hidden="true" className={cn(avatarVariants({ size }), className)} {...props}>
      {initials}
    </span>
  );
}

/* ----------------------------------------------------------------------------
   COUNTRY CHIP
   The live product renders flag EMOJI as production iconography (🇮🇳 🇺🇸 …),
   alongside 🪙🔥⏫💹 used as functional icons. Emoji render differently on every
   OS, are frequently unavailable on Windows for regional indicators, and are
   announced verbosely by screen readers. A two-letter typographic chip is
   stable everywhere and reads as data rather than as decoration.
   -------------------------------------------------------------------------- */
export function CountryChip({
  code,
  name,
  className,
}: {
  code: string;
  name?: string;
  className?: string;
}) {
  return (
    <span
      title={name ?? code}
      className={cn(
        'inline-grid h-[18px] min-w-[26px] flex-none place-items-center rounded-[5px] border border-line bg-surface-3',
        'font-mono text-[10px] font-bold tracking-[0.04em] text-text-3',
        className,
      )}
    >
      <span className="sr-only">{name ? `Country: ${name}` : `Country code ${code}`}</span>
      <span aria-hidden="true">{code}</span>
    </span>
  );
}
