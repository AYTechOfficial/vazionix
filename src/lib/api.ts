'use client';

/* ============================================================================
   API CLIENT
   ----------------------------------------------------------------------------
   One fetch wrapper for every call the browser makes to our own API. It exists
   so three behaviours are identical everywhere:

   1. ERRORS ARRIVE AS `ApiError`, carrying the server's own message and code.
      A claim that fails because of a cooldown and one that fails because of a
      captcha need different UI, and `code` is what lets a component tell them
      apart without string-matching a sentence.

   2. `credentials: 'include'` and `cache: 'no-store'`, always. These are
      authenticated per-user calls; a cached balance is a wrong balance.

   3. A SESSION EXPIRY IS HANDLED ONCE. A 401 means the session cookie died
      (revoked, or fourteen days old). Rather than every caller writing its own
      redirect, the client fires a `vazionix:session-expired` event that the app
      shell listens for.
   ========================================================================== */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const SESSION_EXPIRED_EVENT = 'vazionix:session-expired';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: 'include',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError('Network problem. Check your connection and try again.', 0, 'network');
  }

  let body: Record<string, unknown> = {};
  try {
    const text = await response.text();
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    // A non-JSON body from a proxy or an error page. Fall through to the status.
  }

  if (!response.ok) {
    const message =
      typeof body.error === 'string'
        ? body.error
        : `Request failed (${response.status}).`;
    const code = typeof body.code === 'string' ? body.code : 'error';

    if (response.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    }

    throw new ApiError(message, response.status, code, body);
  }

  return body as T;
}

export const api = {
  get: <T,>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T,>(path: string, payload?: unknown) =>
    request<T>(path, { method: 'POST', body: payload ? JSON.stringify(payload) : undefined }),
  patch: <T,>(path: string, payload?: unknown) =>
    request<T>(path, { method: 'PATCH', body: payload ? JSON.stringify(payload) : undefined }),
  del: <T,>(path: string) => request<T>(path, { method: 'DELETE' }),
};

/* ---- TYPED ENDPOINTS -------------------------------------------------------
   Named per action rather than per URL, so a component reads
   `claimFaucet({ captchaToken })` and never assembles a path.              */

import type {
  ChallengeItem,
  DailyState,
  FaucetState,
  LotteryState,
  PayoutRail,
  PlatformStats,
  UserProfile,
  WithdrawQuote,
  WithdrawalRecord,
  AppNotification,
  CouponRow,
  PayoutTickerRow,
} from '@/lib/models';

export interface ClaimResponse {
  ok: true;
  credited: number;
  exp: number;
  balance: number;
  level: number;
  levelUp: boolean;
  profile?: UserProfile | null;
}

export const endpoints = {
  faucetState: () => api.get<FaucetState>('/api/earn/faucet'),
  claimFaucet: (captchaToken?: string | null) =>
    api.post<ClaimResponse & { state: FaucetState; happyHour: boolean; bonusBps: number }>(
      '/api/earn/faucet',
      { captchaToken },
    ),

  startPtc: (adId: string) =>
    api.post<{ ok: true; token: string; targetUrl: string; requiredSeconds: number; title: string }>(
      '/api/earn/ptc',
      { action: 'start', adId },
    ),
  completePtc: (token: string, captchaToken?: string | null) =>
    api.post<ClaimResponse & { availableAt: string }>('/api/earn/ptc', {
      action: 'complete',
      token,
      captchaToken,
    }),

  startShortlink: (linkId: string) =>
    api.post<{ ok: true; token: string; targetUrl: string; requiredSeconds: number; name: string }>(
      '/api/earn/shortlink',
      { action: 'start', linkId },
    ),
  completeShortlink: (token: string, captchaToken?: string | null) =>
    api.post<ClaimResponse & { availableAt: string }>('/api/earn/shortlink', {
      action: 'complete',
      token,
      captchaToken,
    }),

  dailyState: () => api.get<DailyState>('/api/earn/daily'),
  claimDaily: () =>
    api.post<ClaimResponse & { state: DailyState; step: number; streakDays: number }>('/api/earn/daily'),

  challenges: () => api.get<{ challenges: ChallengeItem[] }>('/api/earn/challenge'),
  claimChallenge: (challengeId: string) =>
    api.post<ClaimResponse & { challenges: ChallengeItem[] }>('/api/earn/challenge', { challengeId }),

  lottery: () => api.get<LotteryState>('/api/earn/lottery'),
  buyTickets: (count: number) =>
    api.post<{ ok: true; bought: number; balance: number; state: LotteryState }>('/api/earn/lottery', {
      count,
    }),

  withdrawContext: () =>
    api.get<{ rails: PayoutRail[]; history: WithdrawalRecord[]; balance: number; locked: number }>(
      '/api/withdraw',
    ),
  quoteWithdrawal: (payload: { coin: string; rail: string; amount: string }) =>
    api.post<{ ok: true; quote: WithdrawQuote; balance: number }>('/api/withdraw', {
      action: 'quote',
      ...payload,
    }),
  requestWithdrawal: (payload: {
    coin: string;
    rail: string;
    address: string;
    amount: string;
    clientRequestId: string;
    captchaToken?: string | null;
    saveAddress?: boolean;
    addressLabel?: string;
  }) =>
    api.post<{
      ok: true;
      withdrawal: WithdrawalRecord;
      history: WithdrawalRecord[];
      balance: number;
      locked: number;
    }>('/api/withdraw', { action: 'request', ...payload }),

  profile: () => api.get<{ profile: UserProfile | null }>('/api/account'),
  updateAccount: (patch: Record<string, unknown>) =>
    api.patch<{ ok: true; profile: UserProfile | null }>('/api/account', patch),
  changeUsername: (username: string) =>
    api.post<{ ok: true; profile: UserProfile | null }>('/api/account', { action: 'username', username }),

  notifications: () => api.get<{ notifications: AppNotification[] }>('/api/notifications'),
  markNotificationsRead: () =>
    api.post<{ ok: true; notifications: AppNotification[] }>('/api/notifications'),

  redeemCoupon: (code: string) =>
    api.post<{ ok: true; message: string; tokens: number; redemptions: CouponRow[]; profile: UserProfile | null }>(
      '/api/coupon',
      { code },
    ),

  stats: () => api.get<{ stats: PlatformStats; ticker: PayoutTickerRow[] }>('/api/stats'),
};
