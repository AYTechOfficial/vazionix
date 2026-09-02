'use client';

import * as React from 'react';
import { Check, Flame, Gift } from 'lucide-react';

import { cn } from '@/lib/utils';
import { clock, nf, tokens } from '@/lib/format';
import { ApiError, endpoints } from '@/lib/api';
import { useCoinBurst, usePrefersReducedMotion } from '@/lib/hooks';
import type { DailyState } from '@/lib/models';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/components/providers/SessionProvider';
import { AdUnit } from '@/components/ads/AdUnit';

/* ============================================================================
   DAILY BONUS LADDER
   ----------------------------------------------------------------------------
   Eight steps, each compounding the earning bonus applied to everything else.

   THE RESET RULE IS STATED ON THE PAGE
   Two windows govern the ladder: the next claim unlocks after the cooldown, and
   the streak breaks after a longer grace period. A user who does not know the
   second number will eventually lose a seven-day streak and open a ticket about
   it, so the countdown to the break is shown next to the countdown to the claim.
   ========================================================================== */

export function DailyLadder({ initialState }: { initialState: DailyState }) {
  const [state, setState] = React.useState(initialState);
  const [remaining, setRemaining] = React.useState(initialState.secondsRemaining);
  const [claiming, setClaiming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [justClaimed, setJustClaimed] = React.useState(false);

  const { applyClaim, setProfile } = useSession();
  const { toast } = useToast();
  const burst = useCoinBurst();
  const reduced = usePrefersReducedMotion();
  const buttonRef = React.useRef<HTMLButtonElement>(null);

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
  const step = state.steps[state.current];

  const claim = async () => {
    if (claiming || !ready) return;
    setClaiming(true);
    setError(null);

    try {
      const result = await endpoints.claimDaily();
      setState(result.state);
      setJustClaimed(true);
      applyClaim(result.credited, `Day ${result.step + 1} claimed · ${tokens(result.credited)} tokens`);
      if (result.profile) setProfile(result.profile);
      if (!reduced) burst(buttonRef.current);
      if (result.levelUp) toast('Level up — your earning bonus went up', 'success');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not claim the daily bonus.';
      setError(message);
      toast(message, 'danger');
    } finally {
      setClaiming(false);
    }
  };

  return (
    <>
      <Card as="section" className="mt-5">
        <CardHead>
          <div className="min-w-0">
            <CardTitle>The ladder</CardTitle>
            <CardSub>Each day compounds the bonus applied to everything else you earn</CardSub>
          </div>
          <Pill tone={state.streakDays > 0 ? 'warning' : 'neutral'} icon={Flame}>
            {state.streakDays}-day streak
          </Pill>
        </CardHead>

        <CardBody>
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
            {state.steps.map((s, i) => {
              const done = i < state.current;
              const isToday = i === state.current;
              return (
                <li
                  key={s.day}
                  aria-current={isToday ? 'step' : undefined}
                  className={cn(
                    'relative rounded-md border border-line bg-surface-1 px-2 py-4 text-center transition-all duration-base ease-out',
                    done && 'border-line-accent bg-mint-dim',
                    isToday &&
                      '-translate-y-[3px] border-mint bg-surface-2 shadow-[0_0_0_1px_var(--mint),0_10px_30px_-12px_var(--mint-dim-2)]',
                    !done && !isToday && 'opacity-50',
                  )}
                >
                  {done ? (
                    <Check
                      aria-hidden="true"
                      className="absolute right-1.5 top-1.5 size-3 text-mint"
                      strokeWidth={3}
                    />
                  ) : null}
                  <div
                    className={cn(
                      'text-11 font-bold uppercase tracking-wide',
                      done ? 'text-mint' : 'text-text-3',
                    )}
                  >
                    Day {s.day + 1}
                  </div>
                  <div className={cn('mt-2 font-mono text-16 font-semibold tabular', done && 'text-mint')}>
                    {s.tokens}
                  </div>
                  <div className="mt-0.5 text-11 text-text-3">
                    +{s.exp} exp · +{s.bonus}%
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              ref={buttonRef}
              variant="primary"
              size="lg"
              onClick={claim}
              disabled={!ready || claiming}
              className="sm:min-w-[260px]"
            >
              <Gift aria-hidden="true" />
              {claiming
                ? 'Claiming…'
                : ready
                  ? `Claim day ${state.current + 1} — ${nf(step?.tokens ?? 0)} tokens`
                  : `Next claim in ${clock(remaining, true)}`}
            </Button>

            <p className="text-12 text-text-3">
              {ready
                ? `Claiming moves you to day ${Math.min(state.current + 2, state.steps.length)} and raises your earning bonus.`
                : 'Come back when the timer hits zero. Your streak is safe until then.'}
            </p>
          </div>

          {error ? (
            <Alert tone="danger" className="mt-3 text-12">
              {error}
            </Alert>
          ) : null}

          {justClaimed ? <AdUnit placement="daily.afterClaim" className="mt-4" /> : null}
        </CardBody>
      </Card>

      <Alert tone="warning" className="mt-5">
        Miss a day and the ladder resets to day 1. Claiming any time inside the window keeps the streak, so a
        few hours late is fine — a full day is not.
      </Alert>
    </>
  );
}
