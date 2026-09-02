import 'server-only';

/* ============================================================================
   FIXED-POINT DECIMAL
   ----------------------------------------------------------------------------
   Money maths on 8-decimal assets, without a dependency.

   Everything is a BigInt scaled by 10^12. Twelve digits is enough for BTC's
   eight and for SHIB-class assets quoted at 0.0000000135, with headroom for an
   intermediate division. A JavaScript number cannot do this: 0.1 + 0.2 is not
   0.3, and a faucet that pays out 0.30000000000000004 LTC produces a support
   ticket per payout.

   Only two operations ever cross the boundary: `parse` at the edge where a
   string arrives, and `format` at the edge where a string is stored or shown.
   ========================================================================== */

const SCALE = 12n;
const ONE = 10n ** SCALE;

export type Decimal = bigint;

export function parse(value: string | number | null | undefined): Decimal {
  if (value === null || value === undefined) return 0n;
  const text = String(value).trim();
  if (!text || !/^-?\d*(\.\d*)?$/.test(text)) return 0n;

  const negative = text.startsWith('-');
  const body = negative ? text.slice(1) : text;
  const [whole = '0', fraction = ''] = body.split('.');
  const padded = (fraction + '0'.repeat(Number(SCALE))).slice(0, Number(SCALE));
  const result = BigInt(whole || '0') * ONE + BigInt(padded || '0');
  return negative ? -result : result;
}

export function format(value: Decimal, decimals = 8): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;

  const whole = abs / ONE;
  const fraction = abs % ONE;
  const digits = fraction.toString().padStart(Number(SCALE), '0');

  if (decimals <= 0) return `${negative ? '-' : ''}${whole}`;
  const cut = digits.slice(0, decimals);
  return `${negative ? '-' : ''}${whole}.${cut}`;
}

export const add = (a: Decimal, b: Decimal): Decimal => a + b;
export const sub = (a: Decimal, b: Decimal): Decimal => a - b;
export const mul = (a: Decimal, b: Decimal): Decimal => (a * b) / ONE;

export function div(a: Decimal, b: Decimal): Decimal {
  if (b === 0n) return 0n;
  return (a * ONE) / b;
}

export const gt = (a: Decimal, b: Decimal): boolean => a > b;
export const gte = (a: Decimal, b: Decimal): boolean => a >= b;
export const lt = (a: Decimal, b: Decimal): boolean => a < b;
export const isZero = (a: Decimal): boolean => a === 0n;
export const max = (a: Decimal, b: Decimal): Decimal => (a > b ? a : b);

/** Decimal → number, for display-only paths (charts, USD approximations). */
export const toNumber = (value: Decimal): number => Number(value) / Number(ONE);

/** Round UP to an integer, used when converting an asset amount into the tokens
    it costs. Rounding down would let a user withdraw slightly more value than
    they paid for, repeatedly. */
export function ceilToInt(value: Decimal): number {
  const whole = value / ONE;
  return Number(value % ONE === 0n ? whole : whole + 1n);
}

/** Natural on-chain precision per asset. */
export const ASSET_DECIMALS: Record<string, number> = {
  BTC: 8, LTC: 8, SOL: 8, BNB: 8,
  TON: 6, USDT: 6, TRX: 6, DOGE: 6,
  PEPE: 0, SHIB: 0, FLOKI: 0, BONK: 0,
};

export const decimalsFor = (coin: string): number => ASSET_DECIMALS[coin] ?? 6;
