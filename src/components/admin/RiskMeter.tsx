import * as React from 'react';

import { cn } from '@/lib/utils';

/* ============================================================================
   RISK METER
   ----------------------------------------------------------------------------
   A 0–100 score rendered as a bar plus the number. Both, always: the bar is
   scannable down a column of twenty payouts, the number is what gets pasted into
   a ticket. Colour bands the score (>=70 high, >=40 medium) but never carries the
   meaning alone — the numeral is right there, and the accessible label spells the
   band out.

   The score is computed in `src/server/admin.ts` from explainable inputs: account
   age, earn rate, unverified email, unqualified referral fan-out. An admin
   suspending an account has to be able to say why, and "0.7 from the model" is not
   a reason anybody can defend in a support reply.
   ========================================================================== */

const riskBand = (score: number): 'hi' | 'md' | 'lo' => (score >= 70 ? 'hi' : score >= 40 ? 'md' : 'lo');

const BAND_FILL = {
  hi: 'bg-danger',
  md: 'bg-warning',
  lo: 'bg-success',
} as const;

const BAND_TEXT = {
  hi: 'text-danger',
  md: 'text-warning',
  lo: 'text-text-2',
} as const;

const BAND_WORD = { hi: 'high', md: 'medium', lo: 'low' } as const;

export function RiskMeter({ score, className }: { score: number; className?: string }) {
  const band = riskBand(score);
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span
        role="img"
        aria-label={`Risk ${score} of 100, ${BAND_WORD[band]}`}
        className="relative block h-1 w-[46px] flex-none overflow-hidden rounded-full bg-surface-3"
      >
        <span
          aria-hidden="true"
          className={cn('absolute inset-y-0 left-0 rounded-full', BAND_FILL[band])}
          style={{ width: `${Math.min(100, score)}%` }}
        />
      </span>
      <span aria-hidden="true" className={cn('font-mono text-12 font-semibold tabular', BAND_TEXT[band])}>
        {score}
      </span>
    </span>
  );
}
