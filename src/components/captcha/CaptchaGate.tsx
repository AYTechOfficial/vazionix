'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';
import {
  captchaEnabled,
  captchaSiteKey,
  captchaSpec,
  captchaProvider,
} from '@/lib/captcha/config';

/* ============================================================================
   CAPTCHA GATE
   ----------------------------------------------------------------------------
   Renders whichever provider is configured and hands the solved token up. With
   no provider configured it renders NOTHING and reports "solved" immediately,
   so local development is not blocked by a widget that cannot load.

   THE SLOT IS RESERVED EITHER WAY
   The container is sized from the provider spec before the script loads, for the
   same reason ad slots are: a widget that appears and pushes the Claim button
   down half a second after the page settles gets misclicked.

   WHAT THIS COMPONENT DOES NOT DO
   It does not decide whether a claim is allowed. It produces a token. The server
   verifies it (`src/server/captcha.ts`) with the secret key and records it as
   single-use. Treat everything here as UI.

   ADSLAB
   AdsLab hands you a loader URL and a container class. Set
   NEXT_PUBLIC_CAPTCHA_PROVIDER=adslab, NEXT_PUBLIC_CAPTCHA_SITE_KEY=<zone> and
   NEXT_PUBLIC_CAPTCHA_SCRIPT_URL=<their loader>, then this mounts their widget
   and reads the token out of the hidden input their script writes.
   ========================================================================== */

declare global {
  interface Window {
    hcaptcha?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string; reset: (id?: string) => void };
    turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string; reset: (id?: string) => void };
    grecaptcha?: { render: (el: HTMLElement, opts: Record<string, unknown>) => number; reset: (id?: number) => void };
  }
}

export interface CaptchaGateProps {
  /** Fires with the token when solved, and with null when it expires. */
  onToken: (token: string | null) => void;
  className?: string;
  /** Remount key. Change it after a claim to force a fresh challenge. */
  resetKey?: number;
}

let scriptPromise: Promise<void> | null = null;

/** Load the provider script once per page, whatever how many gates mount. */
function loadScript(src: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-captcha="1"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.defer = true;
    script.dataset.captcha = '1';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Captcha script failed to load'));
    document.head.appendChild(script);
  });

  return scriptPromise;
}

export function CaptchaGate({ onToken, className, resetKey = 0 }: CaptchaGateProps) {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  const spec = React.useMemo(() => captchaSpec(), []);

  /* No provider: report solved once and render nothing. The server agrees — it
     skips verification when the provider is 'none'. */
  React.useEffect(() => {
    if (!captchaEnabled) onToken('');
  }, [onToken]);

  React.useEffect(() => {
    if (!captchaEnabled || !spec.script || !hostRef.current) return;

    let cancelled = false;
    setStatus('loading');
    const host = hostRef.current;
    host.innerHTML = '';

    loadScript(spec.script)
      .then(() => {
        if (cancelled || !host) return;

        const opts = {
          sitekey: captchaSiteKey,
          callback: (token: string) => onToken(token),
          'expired-callback': () => onToken(null),
          'error-callback': () => onToken(null),
          theme: 'dark',
        };

        /* Each provider exposes an explicit render for the same reason: we need
           the widget inside our reserved box, not wherever auto-render puts it. */
        if (captchaProvider === 'hcaptcha' && window.hcaptcha) {
          window.hcaptcha.render(host, opts);
        } else if (captchaProvider === 'turnstile' && window.turnstile) {
          window.turnstile.render(host, opts);
        } else if (captchaProvider === 'recaptcha' && window.grecaptcha) {
          window.grecaptcha.render(host, opts);
        } else {
          /* AdsLab and anything else script-driven: give the loader the container
             it expects, then watch for the hidden input it fills. */
          const container = document.createElement('div');
          container.className = spec.widgetClass;
          container.dataset.sitekey = captchaSiteKey;
          container.dataset.theme = 'dark';
          host.appendChild(container);

          const poll = window.setInterval(() => {
            const field = host.querySelector<HTMLInputElement>(
              `[name="${spec.tokenField}"], textarea[name="${spec.tokenField}"]`,
            );
            if (field?.value) {
              onToken(field.value);
              window.clearInterval(poll);
            }
          }, 400);

          window.setTimeout(() => window.clearInterval(poll), 180_000);
        }

        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('failed');
      });

    return () => {
      cancelled = true;
    };
  }, [onToken, spec, resetKey]);

  if (!captchaEnabled) return null;

  if (!spec.script) {
    /* A provider is selected but no loader URL is configured. Say so rather than
       rendering an empty box the user will stare at. */
    return (
      <div className={cn('rounded-md border border-dashed border-warning/40 bg-warning/5 p-3', className)}>
        <p className="text-12 text-warning">
          Captcha provider <strong>{spec.label}</strong> is selected but{' '}
          <code className="font-mono text-11">NEXT_PUBLIC_CAPTCHA_SCRIPT_URL</code> is not set.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div
        ref={hostRef}
        className="grid place-items-center rounded-md border border-line bg-surface-2/40"
        style={{ minWidth: spec.width, minHeight: spec.height }}
        aria-label="Captcha challenge"
      >
        {status === 'loading' ? (
          <span className="text-11 text-text-3">Loading captcha…</span>
        ) : status === 'failed' ? (
          <span className="px-3 text-center text-11 text-danger">
            Captcha failed to load. Disable your ad blocker for this site and refresh.
          </span>
        ) : null}
      </div>
      <span className="text-11 text-text-3">Verified on our server before any claim is credited.</span>
    </div>
  );
}

/**
 * Hook form, for a component that needs the token but renders the gate itself.
 * Returns `[token, gate, reset]`.
 */
export function useCaptcha(): [string | null, React.ReactNode, () => void] {
  const [token, setToken] = React.useState<string | null>(captchaEnabled ? null : '');
  const [key, setKey] = React.useState(0);

  const onToken = React.useCallback((value: string | null) => setToken(value), []);
  const reset = React.useCallback(() => {
    setToken(captchaEnabled ? null : '');
    setKey((k) => k + 1);
  }, []);

  const gate = React.useMemo(
    () => <CaptchaGate onToken={onToken} resetKey={key} />,
    [onToken, key],
  );

  return [token, gate, reset];
}

export const isCaptchaRequired = captchaEnabled;
