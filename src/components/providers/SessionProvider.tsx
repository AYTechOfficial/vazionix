'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { getDb, isFirebaseConfigured } from '@/lib/firebase/client';
import { earningBonusBps, levelFromExp, DEFAULT_ECONOMY } from '@/lib/config/economy';
import { endpoints, SESSION_EXPIRED_EVENT } from '@/lib/api';
import type { CoinTicker, UserProfile } from '@/lib/models';
import { useToast } from '@/components/ui/Toast';

/* ============================================================================
   SESSION PROVIDER — the live account state
   ----------------------------------------------------------------------------
   One object, one subscription, every screen. The profile arrives from the
   server on first render (so the header balance is correct in the initial HTML)
   and is then kept live by a Firestore `onSnapshot` on `/users/{uid}`.

   WHY A SNAPSHOT LISTENER AND NOT POLLING
   Credits arrive from places the browser did not initiate: an offerwall postback
   lands minutes after the user left the wall, a referral commission lands when
   somebody else claims, an admin adjustment lands out of nowhere. Polling would
   either be slow enough to look broken or frequent enough to be expensive. One
   listener costs one document read per change, and the change is what we care
   about.

   THE BALANCE IS NEVER WRITTEN HERE
   `firestore.rules` denies client writes to `balance`, `level`, `exp` and
   `earningBonusBps`. `applyClaim()` below does not set the balance — it records
   a delta for the header's "+65" animation and lets the listener deliver the
   authoritative number a moment later. If the two ever disagree, the listener
   wins, which is the correct precedence on a payouts product.

   WITHOUT FIREBASE CLIENT CONFIG
   The listener is skipped and `refresh()` re-reads `/api/account` after each
   action. Everything still works; updates are just request-scoped rather than
   pushed.
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
    if (!uid || !isFirebaseConfigured) return;

    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      const db = getDb();
      if (!db) return;
      const { doc, onSnapshot } = await import('firebase/firestore');
      if (cancelled) return;

      unsubscribe = onSnapshot(
        doc(db, 'users', uid),
        (snap) => {
          const data = snap.data();
          if (!data) return;

          /* Only the server-owned numbers are taken from the snapshot. Anything
             derived (level thresholds, bonus percent) is recomputed from the same
             config the server used, so the progress bar cannot disagree with the
             level that produced it. */
          const totalExp = Number(data.totalExp ?? data.exp ?? 0);
          const { level, exp, expNext } = levelFromExp(totalExp, DEFAULT_ECONOMY.levels);
          const streak = Number(data.streakDays ?? 0);

          setProfile((current) =>
            current
              ? {
                  ...current,
                  balance: Number(data.balance ?? current.balance),
                  lockedBalance: Number(data.lockedBalance ?? current.lockedBalance),
                  depositBalance: Number(data.depositBalance ?? current.depositBalance),
                  totalEarned: Number(data.totalEarned ?? current.totalEarned),
                  level,
                  exp,
                  expNext,
                  streak,
                  earningBonus:
                    Number(data.earningBonusBps ?? earningBonusBps(level, streak, DEFAULT_ECONOMY.levels)) / 100,
                  suspended: data.suspended === true,
                  username: typeof data.username === 'string' ? data.username : current.username,
                  referralTier: current.tier,
                  tier: (data.referralTier ?? current.tier) as UserProfile['tier'],
                  commissionRate: Number(data.commissionBps ?? current.commissionRate * 100) / 100,
                } as UserProfile
              : current,
          );
        },
        (error) => {
          /* A rules failure here means the user document is not readable, which
             is a configuration problem worth surfacing once rather than silently
             leaving a stale balance on screen. */
          console.error('[session] profile listener failed', error);
        },
      );
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
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
