'use client';

import * as React from 'react';
import { AlertTriangle, CheckCircle2, Droplet, Flame, Timer } from 'lucide-react';

import { ApiError, endpoints } from '@/lib/api';
import { clock, nf, tokens } from '@/lib/format';
import { useCoinBurst, usePrefersReducedMotion } from '@/lib/hooks';
import type { FaucetState } from '@/lib/models';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';
import { ProgressRing } from '@/components/ui/Progress';
import { useToast } from '@/components/ui/Toast';
import { CaptchaGate } from '@/components/captcha/CaptchaGate';
import { isCaptchaRequired } from '@/components/captcha/CaptchaGate';
import { useSession } from '@/components/providers/SessionProvider';
import { AdUnit } from '@/components/ads/AdUnit';

/* ============================================================================
   FAUCET CLAIM CARD
   ----------------------------------------------------------------------------
   The claim button, the cooldown ring and the captcha, in one component,
   because they are one decision. The live product buried the timer in a KPI card
   six hundred pixels above the button on a different page.

   THE COUNTDOWN IS DERIVED, NOT STORED
   The server returns `nextClaimAt` as an absolute ISO instant. The ring counts
   down to it from the browser's clock, so a tab left open overnight resumes at
   the correct number rather than continuing from where the interval last fired,
   and a clock skew shows up as a few seconds rather than as a free claim.

   ON SUCCESS
   The response carries the authoritative balance and the next claim time. The
   coin burst and the header tick are cosmetic; the numbers come from the server.
   A post-claim ad slot renders in the success panel — peak attention, and the
   one moment a user is happy to look at something.
   ========================================================================== */

export interface FaucetClaimProps {
  initialState: FaucetState;
  /** Renders the compact dashboard variant. */
  compact?: boolean;
}

/** "12" for a flat award, "10–20" when the claim rolls inside a band. The
    range is shown rather than a single number so the credited EXP never looks
    like it contradicts the label. */
function expLabel(state: FaucetState): string {
  const min = state.expMin ?? state.exp;
  const max = state.expMax ?? state.exp;
  return max > min ? `${min}–${max}` : String(min);
}

export function FaucetClaim({ initialState, compact = false }: FaucetClaimProps) {
  const [state, setState] = React.useState(initialState);
  const [remaining, setRemaining] = React.useState(initialState.secondsRemaining);
  const [captchaToken, setCaptchaToken] = React.useState<string | null>(isCaptchaRequired ? null : '');
  const [captchaKey, setCaptchaKey] = React.useState(0);
  const [claiming, setClaiming] = React.useState(false);
  const [lastWin, setLastWin] = React.useState<{ credited: number; exp: number } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const { applyClaim, setProfile } = useSession();
  const { toast } = useToast();
  const burst = useCoinBurst();
  const reduced = usePrefersReducedMotion();
  const buttonRef = React.useRef<HTMLButtonElement>(null);

  /* ---- COUNTDOWN ---------------------------------------------------------- */
  React.useEffect(() => {
    if (!state.nextClaimAt) {
      setRemaining(0);
      return;
    }

    const target = Date.parse(state.nextClaimAt);
    const tick = () => setRemaining(Math.max(0, Math.ceil((target - Date.now()) / 1000)));
    tick();

    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [state.nextClaimAt]);

  const ready = remaining <= 0;
  const captchaSatisfied = !state.captchaRequired || !isCaptchaRequired || Boolean(captchaToken);
  const atDailyCap = state.claimsToday >= state.dailyCap;

  const claim = async () => {
    if (claiming || !ready || atDailyCap) return;
    setClaiming(true);
    setError(null);

    try {
      const result = await endpoints.claimFaucet(captchaToken);

      setState(result.state);
      setLastWin({ credited: result.credited, exp: result.exp });
      applyClaim(result.credited, `Claimed ${tokens(result.credited)} tokens · +${result.exp} exp`);
      if (result.profile) setProfile(result.profile);
      if (!reduced) burst(buttonRef.current);

      if (result.levelUp) toast(`Level ${result.level} — your earning bonus went up`, 'success');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Claim failed. Try again.';
      setError(message);
      toast(message, 'danger');

      /* A cooldown or cap rejection means our view of the state is stale; take
         the server's. */
      if (err instanceof ApiError && (err.code === 'cooldown' || err.code === 'daily_cap')) {
        try {
          setState(await endpoints.faucetState());
        } catch {
          // Leave the existing state; the countdown will correct on next render.
        }
      }
    } finally {
      setClaiming(false);
      /* Always burn the captcha: a solved token is single-use server-side, so
         keeping it on screen would guarantee the next claim fails. */
      setCaptchaToken(isCaptchaRequired ? null : '');
      setCaptchaKey((k) => k + 1);
    }
  };

  const ringLabel = ready ? 'GO' : remaining >= 3600 ? clock(remaining, true) : clock(remaining);

  return (
    <Card as="section" pad={compact ? 'md' : 'lg'}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <CardTitle>Faucet</CardTitle>
        <div className="flex items-center gap-2">
          {state.happyHourActive ? (
            <Pill tone="warning" icon={Flame}>
              Happy hour +{state.happyHourBonusPct}%
            </Pill>
          ) : null}
          <Pill tone={ready ? 'mint' : 'neutral'} icon={ready ? CheckCircle2 : Timer}>
            {ready ? 'Ready' : 'Cooling down'}
          </Pill>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <ProgressRing
          value={state.cooldownSeconds - remaining}
          max={state.cooldownSeconds}
          size={compact ? 68 : 96}
          thickness={compact ? 6 : 8}
          srLabel={ready ? 'Faucet ready to claim' : `Faucet cooling down, ${remaining} seconds left`}
          label={
            <span className="font-mono text-13 font-semibold tabular text-mint">{ringLabel}</span>
          }
        />

        <div className="flex flex-1 flex-col gap-0.5">
          <div className="font-mono text-24 font-semibold tabular max-md:text-20">
            {nf(state.rewardTokens)} <span className="text-12 text-text-3">tokens</span>
          </div>
          <div className="text-12 text-text-3">
            +{expLabel(state)} exp · every {Math.round(state.cooldownSeconds / 60)} min
          </div>
          <div className="text-11 text-text-3">
            {nf(state.claimsToday)} of {nf(state.dailyCap)} claims used today
          </div>
        </div>
      </div>

      {state.captchaRequired && isCaptchaRequired ? (
        <div className="mt-4">
          <CaptchaGate onToken={setCaptchaToken} resetKey={captchaKey} />
        </div>
      ) : null}

      <Button
        ref={buttonRef}
        variant="primary"
        block
        size={compact ? 'md' : 'lg'}
        className="mt-4"
        disabled={!ready || claiming || atDailyCap || !captchaSatisfied}
        onClick={claim}
      >
        {claiming
          ? 'Claiming…'
          : atDailyCap
            ? 'Daily limit reached'
            : !ready
              ? `Next claim in ${ringLabel}`
              : !captchaSatisfied
                ? 'Complete the captcha'
                : `Claim ${nf(state.rewardTokens)} tokens`}
      </Button>

      {error ? (
        <Alert tone="danger" icon={AlertTriangle} className="mt-3 text-12">
          {error}
        </Alert>
      ) : null}

      {lastWin ? (
        <div className="mt-4 rounded-md border border-mint/30 bg-mint-dim p-3">
          <p className="flex items-center gap-2 text-13 font-semibold text-mint">
            <CheckCircle2 aria-hidden="true" className="size-4" />
            +{tokens(lastWin.credited)} tokens credited · +{lastWin.exp} exp
          </p>
          {/* Peak-attention slot. Renders only after a successful claim. */}
          <AdUnit placement="faucet.afterClaim" className="mt-3" />
        </div>
      ) : null}

      {!state.happyHourActive && state.happyHourAt ? (
        <Alert tone="info" icon={Flame} className="mt-3 text-11">
          Happy hour starts <HappyHourCountdown at={state.happyHourAt} /> — +{state.happyHourBonusPct}% on
          every claim while it runs.
        </Alert>
      ) : null}

      {!compact ? (
        <p className="mt-3 flex items-start gap-2 text-11 leading-body text-text-3">
          <Droplet aria-hidden="true" className="mt-[2px] size-3 flex-none" />
          Your bonus from level and streak is applied on top of the base reward, and the exact amount credited
          is recorded on every claim in Transactions.
        </p>
      ) : null}
    </Card>
  );
}

function HappyHourCountdown({ at }: { at: string }) {
  const [left, setLeft] = React.useState(() => Math.max(0, Math.ceil((Date.parse(at) - Date.now()) / 1000)));

  React.useEffect(() => {
    const target = Date.parse(at);
    const id = window.setInterval(
      () => setLeft(Math.max(0, Math.ceil((target - Date.now()) / 1000))),
      1000,
    );
    return () => window.clearInterval(id);
  }, [at]);

  return <strong className="font-mono tabular">in {clock(left, true)}</strong>;
}
