'use client';

import * as React from 'react';

import { COIN_TICKERS, type CoinTicker } from '@/lib/models';

/* ============================================================================
   RATES PROVIDER
   ----------------------------------------------------------------------------
   `/config/rates` read once on the server and handed down, so every component
   that converts tokens into money uses the same number in the same render. The
   alternative — each component importing a constant — is how a header and a
   withdraw form end up quoting two different prices for the same balance.
   ========================================================================== */

export interface RatesValue {
  usdPerToken: number;
  spot: Record<CoinTicker, number>;
  /** Coins offered in the header currency selector. */
  currencies: CoinTicker[];
  updatedAt: string | null;
}

const FALLBACK: RatesValue = {
  usdPerToken: 0.0000098,
  spot: {
    BTC: 0, LTC: 0, TRX: 0, SOL: 0, DOGE: 0, USDT: 1,
    TON: 0, PEPE: 0, SHIB: 0, FLOKI: 0, BONK: 0, BNB: 0,
  },
  currencies: COIN_TICKERS,
  updatedAt: null,
};

const RatesContext = React.createContext<RatesValue>(FALLBACK);

export function RatesProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: Omit<RatesValue, 'currencies'> & { currencies?: CoinTicker[] };
}) {
  const resolved = React.useMemo<RatesValue>(
    () => ({
      usdPerToken: value.usdPerToken || FALLBACK.usdPerToken,
      spot: { ...FALLBACK.spot, ...value.spot },
      currencies: value.currencies?.length ? value.currencies : COIN_TICKERS,
      updatedAt: value.updatedAt,
    }),
    [value],
  );

  return <RatesContext.Provider value={resolved}>{children}</RatesContext.Provider>;
}

export const useRates = (): RatesValue => React.useContext(RatesContext);

/** Tokens → the selected display currency, as a fixed-decimal string. */
export function useTokenValue(): (tokenCount: number, coin: CoinTicker) => string {
  const { usdPerToken, spot } = useRates();

  return React.useCallback(
    (tokenCount: number, coin: CoinTicker) => {
      const unit = spot[coin] || (coin === 'USDT' ? 1 : 0);
      if (!unit) return '0';
      const amount = (tokenCount * usdPerToken) / unit;
      const dp = amount < 1 ? 8 : amount < 1000 ? 4 : 2;
      return amount.toFixed(dp);
    },
    [spot, usdPerToken],
  );
}
