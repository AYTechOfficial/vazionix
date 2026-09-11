'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { endpoints, SESSION_EXPIRED_EVENT } from '@/lib/api';
import type { CoinTicker, UserProfile } from '@/lib/models';
import { useToast } from '@/components/ui/Toast';

/* ============================================================================
   SESSION PROVIDER — the live account state
   ----------------------------------------------------------------------------
   One object, one subscription, every screen. The profile arrives from the
   server on first render (so the header balance is correct in the initial HTML)
   and is then kept fresh by polling `/api/account`.

   THE BALANCE IS NEVER WRITTEN HERE
   No client can write `balance`, `level`, `exp` or `earning_bonus_bps` — only
   the server's service-role client can, through the ledger. `applyClaim()` below
   does not set the balance — it records a delta for the header's "+65" animation
   and the poll (or the API response's `profile`) replaces it with the
   authoritative number. If the two ever disagree, the server wins, which is the
   correct precedence on a payouts product.
   ========================================================================== */

interface SessionContextValue {
  profile: UserProfile | null;
  /** Convenience: `profile?.balance ?? 0`, the number the header renders. */
  balance: number;
  lockedBalance: number;
  /** Most recent credit delta, consumed by the floating chip in the top bar. */
  lastDelta: { amount: number; nonce: number } | null;
  /** Record a credit for animation, and optionally toast it. */
  applyClaim: (amount: number, message?: string) => void;
  /** Replace the profile wholesale — used with an API response's `profile`. */
  setProfile: (next: UserProfile | null) => void;
  /** Re-read from `/api/account`. */
  refresh: () => Promise<void>;
  currency: CoinTicker;
  setCurrency: (c: CoinTicker) => void;
  signedIn: boolean;
}

const SessionContext = React.createContext<SessionContextValue | null>(null);

export interface SessionProviderProps {
  children: React.ReactNode;
  /** Server-rendered profile. Null for an anonymous viewer. */
  initialProfile: UserProfile | null;
}

export function SessionProvider({ children, initialProfile }: SessionProviderProps) {
  const [profile, setProfile] = React.useState<UserProfile | null>(initialProfile);
  const [lastDelta, setLastDelta] = React.useState<SessionContextValue['lastDelta']>(null);
  const [currency, setCurrency] = React.useState<CoinTicker>(initialProfile?.displayCurrency ?? 'USDT');
  const { toast } = useToast();
  const router = useRouter();
  const nonce = React.useRef(0);

  const uid = profile?.uid ?? null;

  /* ---- LIVE PROFILE ------------------------------------------------------- */
  React.useEffect(() => {
    if (!uid) return;

    // Poll /api/account on an interval so pushed-looking updates (an offerwall
    // postback, a referral commission, an admin adjustment) land within seconds.
    let alive = true;
    const poll = async () => {
      try {
        const { profile: next } = await endpoints.profile();
        if (alive && next) setProfile(next);
      } catch {
        // Ignore transient failures; keep the last known profile.
      }
    };
    void poll();
    const id = window.setInterval(poll, 15000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [uid]);

  /* ---- SESSION EXPIRY ----------------------------------------------------- */
  React.useEffect(() => {
    const onExpired = () => {
      toast('Your session expired. Sign in again.', 'warning');
      router.push('/login');
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [router, toast]);

  const applyClaim = React.useCallback(
    (amount: number, message?: string) => {
      nonce.current += 1;
      setLastDelta({ amount, nonce: nonce.current });

      /* Optimistic bump so the header moves on the same frame as the button.
         The listener (or the API response's `profile`) replaces it shortly. */
      setProfile((current) =>
        current ? { ...current, balance: current.balance + amount } : current,
      );

      if (message) toast(message, 'success');
    },
    [toast],
  );

  const refresh = React.useCallback(async () => {
    try {
      const { profile: next } = await endpoints.profile();
      if (next) setProfile(next);
    } catch {
      // A failed refresh leaves the last known values on screen, which is better
      // than blanking a balance because one request lost a race.
    }
  }, []);

  const value = React.useMemo<SessionContextValue>(
    () => ({
      profile,
      balance: profile?.balance ?? 0,
      lockedBalance: profile?.lockedBalance ?? 0,
      lastDelta,
      applyClaim,
      setProfile,
      refresh,
      currency,
      setCurrency,
      signedIn: Boolean(profile),
    }),
    [profile, lastDelta, applyClaim, refresh, currency],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = React.useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}

/** Non-throwing variant, for components that also render on public pages. */
export function useOptionalSession(): SessionContextValue | null {
  return React.useContext(SessionContext);
}
