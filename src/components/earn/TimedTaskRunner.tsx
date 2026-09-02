'use client';

import * as React from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, Timer } from 'lucide-react';

import { ApiError, endpoints } from '@/lib/api';
import { clock, nf, tokens } from '@/lib/format';
import { useCoinBurst, usePrefersReducedMotion } from '@/lib/hooks';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ProgressBar } from '@/components/ui/Progress';
import { useToast } from '@/components/ui/Toast';
import { CaptchaGate, isCaptchaRequired } from '@/components/captcha/CaptchaGate';
import { useSession } from '@/components/providers/SessionProvider';
import { AdUnit } from '@/components/ads/AdUnit';
import type { PlacementId } from '@/lib/ads/placements';

/* ============================================================================
   TIMED TASK RUNNER — shared by PTC and shortlinks
   ----------------------------------------------------------------------------
   Both formats pay for time on a destination, so both run the same protocol:

     start     the server issues a single-use token and records `startedAt`
     (wait)    the destination opens; a countdown runs here
     complete  the server checks the elapsed time between its OWN timestamps and
               credits

   THE COUNTDOWN HERE IS A PROGRESS BAR, NOT THE MEASUREMENT
   The server decides whether enough time passed. This component cannot shorten
   it — pausing the JS timer, closing the tab, or editing the countdown changes
   nothing, because `complete` is rejected until the server's own clock agrees.
   That is why the timer is allowed to be this naive.

   Two ad slots earn from the wait itself: one on the pre-view panel and one on
   the reward confirmation. Both are placement ids, so PTC and shortlinks pass
   their own.
   ========================================================================== */

export type TaskKind = 'ptc' | 'shortlink';

export interface TimedTaskRunnerProps {
  kind: TaskKind;
  /** The catalogue item being run. */
  item: { id: string; title: string; reward: number; seconds: number; type?: string };
  open: boolean;
  onClose: () => void;
  /** Called with the ISO availability time after a successful credit. */
  onCredited: (itemId: string, availableAt: string) => void;
  beforePlacement: PlacementId;
  afterPlacement: PlacementId;
}

type Phase = 'idle' | 'starting' | 'waiting' | 'ready' | 'claiming' | 'done' | 'error';

export function TimedTaskRunner({
  kind,
  item,
  open,
  onClose,
  onCredited,
  beforePlacement,
  afterPlacement,
}: TimedTaskRunnerProps) {
  const [phase, setPhase] = React.useState<Phase>('idle');
  const [token, setToken] = React.useState<string | null>(null);
  const [targetUrl, setTargetUrl] = React.useState<string | null>(null);
  const [required, setRequired] = React.useState(item.seconds);
  const [elapsed, setElapsed] = React.useState(0);
  const [captchaToken, setCaptchaToken] = React.useState<string | null>(isCaptchaRequired ? null : '');
  const [captchaKey, setCaptchaKey] = React.useState(0);
  const [credited, setCredited] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const { applyClaim, setProfile } = useSession();
  const { toast } = useToast();
  const burst = useCoinBurst();
  const reduced = usePrefersReducedMotion();
  const claimRef = React.useRef<HTMLButtonElement>(null);
  const startedAt = React.useRef<number>(0);

  /* Reset when the modal is reopened for a different item. */
  React.useEffect(() => {
    if (!open) return;
    setPhase('idle');
    setToken(null);
    setTargetUrl(null);
    setRequired(item.seconds);
    setElapsed(0);
    setCredited(null);
    setError(null);
    setCaptchaToken(isCaptchaRequired ? null : '');
    setCaptchaKey((k) => k + 1);
  }, [open, item.id, item.seconds]);

  /* ---- ELAPSED TICKER ----------------------------------------------------- */
  React.useEffect(() => {
    if (phase !== 'waiting') return;

    const id = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAt.current) / 1000);
      setElapsed(seconds);
      if (seconds >= required) setPhase('ready');
    }, 500);

    return () => window.clearInterval(id);
  }, [phase, required]);

  const start = async () => {
    setPhase('starting');
    setError(null);

    try {
      const result =
        kind === 'ptc'
          ? await endpoints.startPtc(item.id)
          : await endpoints.startShortlink(item.id);

      setToken(result.token);
      setTargetUrl(result.targetUrl);
      setRequired(result.requiredSeconds);
      startedAt.current = Date.now();
      setElapsed(0);
      setPhase('waiting');

      /* Opened from inside the click handler's call stack so the browser treats
         it as user-initiated and does not swallow it as a popup. */
      window.open(result.targetUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not start that task.';
      setError(message);
      setPhase('error');
    }
  };

  const complete = async () => {
    if (!token) return;
    setPhase('claiming');
    setError(null);

    try {
      const result =
        kind === 'ptc'
          ? await endpoints.completePtc(token, captchaToken)
          : await endpoints.completeShortlink(token, captchaToken);

      setCredited(result.credited);
      setPhase('done');
      applyClaim(result.credited, `+${tokens(result.credited)} tokens · +${result.exp} exp`);
      if (result.profile) setProfile(result.profile);
      if (!reduced) burst(claimRef.current);
      onCredited(item.id, result.availableAt);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not credit that task.';
      setError(message);
      setPhase(err instanceof ApiError && err.code === 'too_fast' ? 'waiting' : 'error');
      toast(message, 'danger');
      setCaptchaToken(isCaptchaRequired ? null : '');
      setCaptchaKey((k) => k + 1);
    }
  };

  const left = Math.max(0, required - elapsed);
  const captchaSatisfied = !isCaptchaRequired || Boolean(captchaToken);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item.title}
      description={
        phase === 'done'
          ? 'Credited'
          : phase === 'waiting'
            ? `Stay on the page for ${clock(left)}`
            : `${nf(item.reward)} tokens for ${item.seconds} seconds`
      }
    >
      <div className="flex flex-col gap-4">
        {phase === 'idle' || phase === 'starting' || phase === 'error' ? (
          <>
            <div className="rounded-md border border-line bg-surface-2 p-4">
              <p className="text-13 leading-body text-text-2">
                {kind === 'ptc'
                  ? 'The advertiser page opens in a new tab. Keep it open for the full duration, then come back and claim.'
                  : 'The link opens in a new tab and passes through the advertiser. Keep it open for the full duration, then come back and claim.'}
              </p>
              <p className="mt-2 text-12 text-text-3">
                The timer runs on our server, so closing the tab early or changing the countdown here will not
                credit the reward.
              </p>
            </div>

            {/* Held on screen for the whole pre-view panel. */}
            <AdUnit placement={beforePlacement} />

            {error ? (
              <Alert tone="danger" icon={AlertTriangle} className="text-12">
                {error}
              </Alert>
            ) : null}

            <Button variant="primary" block onClick={start} disabled={phase === 'starting'}>
              <ExternalLink aria-hidden="true" />
              {phase === 'starting' ? 'Opening…' : `Open and start the ${item.seconds}s timer`}
            </Button>
          </>
        ) : null}

        {phase === 'waiting' || phase === 'ready' || phase === 'claiming' ? (
          <>
            <div className="rounded-md border border-line bg-surface-2 p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-12 text-text-3">
                  {left > 0 ? 'Time remaining' : 'Ready to claim'}
                </span>
                <span className="font-mono text-20 font-semibold tabular text-mint">
                  {left > 0 ? clock(left) : '00:00'}
                </span>
              </div>
              <ProgressBar
                className="mt-3"
                value={Math.min(required, elapsed)}
                max={required}
                label="Task progress"
              />
              {targetUrl ? (
                <a
                  href={targetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-12 font-semibold text-mint hover:underline"
                >
                  <ExternalLink aria-hidden="true" className="size-3" />
                  Reopen the page if you closed it
                </a>
              ) : null}
            </div>

            <AdUnit placement={beforePlacement} />

            {isCaptchaRequired && left <= 0 ? (
              <CaptchaGate onToken={setCaptchaToken} resetKey={captchaKey} />
            ) : null}

            {error ? (
              <Alert tone="warning" icon={Timer} className="text-12">
                {error}
              </Alert>
            ) : null}

            <Button
              ref={claimRef}
              variant="primary"
              block
              onClick={complete}
              disabled={left > 0 || phase === 'claiming' || !captchaSatisfied}
            >
              {phase === 'claiming'
                ? 'Crediting…'
                : left > 0
                  ? `Claim in ${clock(left)}`
                  : !captchaSatisfied
                    ? 'Complete the captcha'
                    : `Claim ${nf(item.reward)} tokens`}
            </Button>
          </>
        ) : null}

        {phase === 'done' ? (
          <>
            <div className="rounded-md border border-mint/30 bg-mint-dim p-4">
              <p className="flex items-center gap-2 text-14 font-semibold text-mint">
                <CheckCircle2 aria-hidden="true" className="size-4" />
                +{tokens(credited ?? 0)} tokens credited
              </p>
              <p className="mt-1 text-12 text-text-3">
                It is already in your balance and recorded in Transactions.
              </p>
            </div>

            {/* Reward-confirmation slot: the highest-attention moment on the page. */}
            <AdUnit placement={afterPlacement} />

            <Button variant="secondary" block onClick={onClose}>
              Back to the list
            </Button>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
