'use client';

import * as React from 'react';

import type { PayoutRail, SavedAddress, WithdrawalRecord } from '@/lib/models';
import { AdUnit } from '@/components/ads/AdUnit';
import { WithdrawFlow } from './WithdrawFlow';
import { WithdrawHistory } from './WithdrawHistory';

/* ============================================================================
   WITHDRAW PANEL
   ----------------------------------------------------------------------------
   Holds the one piece of state the flow and the history share: the history list
   itself, which a successful submission prepends to. Without this the user
   submits a payout and the table below still shows the old list until they
   refresh, which reads as a lost withdrawal.

   The ad unit sits between the two — below the entire transaction card, never
   between a money control and its label.
   ========================================================================== */

export function WithdrawPanel({
  rails,
  addresses,
  history: initialHistory,
  minBalanceTokens,
  emailVerified,
}: {
  rails: PayoutRail[];
  addresses: SavedAddress[];
  history: WithdrawalRecord[];
  minBalanceTokens: number;
  emailVerified: boolean;
}) {
  const [history, setHistory] = React.useState(initialHistory);

  return (
    <div className="flex flex-col gap-5">
      <WithdrawFlow
        rails={rails}
        addresses={addresses}
        minBalanceTokens={minBalanceTokens}
        emailVerified={emailVerified}
        onSubmitted={(_record, next) => setHistory(next)}
      />

      <AdUnit placement="withdraw.belowCard" />

      <WithdrawHistory rows={history} />
    </div>
  );
}
