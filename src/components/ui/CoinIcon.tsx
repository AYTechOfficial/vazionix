import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';
import type { CoinTicker } from '@/lib/models';

/* ============================================================================
   COIN ICON
   Ticker-coloured token discs. Authored, not fetched — keeps the bundle
   portable and offline-safe, and every coin stays visually consistent at any
   size. The gradient and its ink colour are both tokens (`--coin-BTC`,
   `--coin-BTC-ink`), so a new listing is one token pair, not a new asset.
   ========================================================================== */

const coinVariants = cva(
  'grid flex-none place-items-center rounded-full font-display font-bold tracking-[-0.03em] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]',
  {
    variants: {
      size: {
        sm: 'size-[22px] text-[8px]',
        md: 'size-[26px] text-[9.5px]',
        lg: 'size-10 text-13',
        xl: 'size-14 text-16',
      },
    },
    defaultVariants: { size: 'md' },
  },
);

export interface CoinIconProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'>,
    VariantProps<typeof coinVariants> {
  ticker: CoinTicker | string;
  /** Set false when the surrounding text already names the asset. */
  labelled?: boolean;
}

export function CoinIcon({ ticker, size, className, labelled = true, style, ...props }: CoinIconProps) {
  return (
    <span
      className={cn(coinVariants({ size }), className)}
      style={{
        background: `var(--coin-${ticker}, var(--surface-3))`,
        color: `var(--coin-${ticker}-ink, var(--coin-ink))`,
        ...style,
      }}
      {...props}
    >
      {labelled ? <span className="sr-only">{ticker}</span> : null}
      <span aria-hidden="true">{ticker.slice(0, 4)}</span>
    </span>
  );
}
