import type { CoinTicker } from '@/lib/models';

/* ============================================================================
   FORMATTERS
   ----------------------------------------------------------------------------
   Pure functions, no data imports. Anything needing a price takes the rate as
   an argument, because the rate is live configuration (`/config/rates`) and a
   formatter that reaches for a module-level constant is a formatter that shows
   yesterday's price.
   ========================================================================== */

/** Fixed-decimal, thousands-separated. The base of everything below. */
export const nf = (n: number, d = 0): string =>
  Number.isFinite(n)
    ? Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
    : '0';

/** Tokens: thousands-separated, one decimal only when actually fractional. */
export const tokens = (n: number): string => {
  const frac = Math.abs(n % 1) > 0.001;
  return nf(n, frac ? 1 : 0);
};

/** Compact for dense chips: 1.28M, 14.8M, 8.4K. */
export const compact = (n: number): string => {
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(a >= 1e10 ? 0 : 1).replace(/\.0$/, '')}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (a >= 1e4) return `${(n / 1e3).toFixed(0)}K`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return nf(n);
};

/** Token count → asset amount, at a supplied USD-per-token and USD-per-unit. */
export const tokensToAsset = (tokenCount: number, usdPerToken: number, usdPerUnit: number): number =>
  usdPerUnit > 0 ? (tokenCount * usdPerToken) / usdPerUnit : 0;

/** Token count → USD string, at the supplied rate. */
export const tokensToUsd = (tokenCount: number, usdPerToken: number, dp = 8): string =>
  (tokenCount * usdPerToken).toFixed(dp);

/** Dollar amounts. Sub-$1 gets five decimals because micro-earning is the
    entire product — rounding $0.37159 to $0.37 erases 40% of the signal. */
export const usd = (v: number): string => `$${Number(v).toFixed(Math.abs(v) < 1 ? 5 : 2)}`;

/** Each asset keeps its natural on-chain precision. */
export const CRYPTO_DP: Record<CoinTicker, number> = {
  BTC: 8, LTC: 8, SOL: 8, BNB: 8,
  TON: 6, USDT: 6, TRX: 6, DOGE: 6,
  PEPE: 0, SHIB: 0, FLOKI: 0, BONK: 0,
};

export const cryptoAmount = (v: number, t: CoinTicker | string): string =>
  nf(v, CRYPTO_DP[t as CoinTicker] ?? 6);

/** 7245 → "02:00:45" ; 2040 → "34:00" */
export const clock = (secs: number, forceHours = false): string => {
  const s = Math.max(0, Math.floor(secs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h || forceHours ? `${p(h)}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
};

/** 230 → "3m 50s" */
export const dur = (secs: number): string => {
  const s = Math.max(0, Math.floor(secs));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  if (!m) return `${rest}s`;
  if (m < 60) return rest ? `${m}m ${rest}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
};

/** bc1qar0srrr7xfkvy5l643lydnw9re59gtzz → "bc1qar0s…59gtzz" */
export const shortAddr = (a: string, head = 6, tail = 6): string =>
  !a || a.length <= head + tail + 1 ? a : `${a.slice(0, head)}…${a.slice(-tail)}`;

/** Signed token delta for activity rows: "+180" / "−2,508" (true minus sign). */
export const signedTokens = (n: number): string => `${n < 0 ? '−' : '+'}${tokens(Math.abs(n))}`;

/* ---- DATES -----------------------------------------------------------------
   Every timestamp crossing the server boundary is an ISO string, so these all
   take one. `relative` deliberately stops at "5 Feb" rather than continuing into
   "3 months ago", which is less useful than the date once past a fortnight.  */

export function relative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '—';

  const diff = Math.floor((now - ms) / 1000);
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 14 * 86400) return `${Math.floor(diff / 86400)}d ago`;
  return shortDate(iso);
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function fullDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} ${date.toLocaleTimeString(
    'en-GB',
    { hour: '2-digit', minute: '2-digit' },
  )}`;
}

/** Seconds until an ISO instant, floored at zero. */
export function secondsUntil(iso: string | null | undefined, now = Date.now()): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? Math.max(0, Math.ceil((ms - now) / 1000)) : 0;
}

/** "2d 04:11:38" — used by the leaderboard reset and the lottery draw. */
export function countdown(iso: string | null | undefined, now = Date.now()): string {
  const total = secondsUntil(iso, now);
  const days = Math.floor(total / 86400);
  const rest = total % 86400;
  return days ? `${days}d ${clock(rest, true)}` : clock(rest, true);
}
