'use client';

import * as React from 'react';

/* ============================================================================
   SHARED HOOKS
   Every animated behaviour in the app funnels through one of these, so
   `prefers-reduced-motion` is honoured in exactly one place per technique
   rather than being re-implemented (and forgotten) per component.
   ========================================================================== */

/**
 * Live `prefers-reduced-motion`. Returns `false` during SSR and on the first
 * client render so markup matches, then flips on mount — a CSS
 * `transition-duration: 0.01ms` override cannot stop a JS-driven counter or an
 * interval-based ticker, so the guard has to exist in JS too.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);

  React.useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

/**
 * Count-up that tweens a *number* and formats on each frame, rather than
 * animating a DOM string. Jumps straight to the target under reduced motion.
 */
export function useCountUp(target: number, durationMs = 900): number {
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = React.useState(target);
  const fromRef = React.useRef(target);

  React.useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;

    if (reduced) {
      fromRef.current = target;
      setValue(target);
      return;
    }

    let raf = 0;
    const t0 = performance.now();
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);

    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / durationMs);
      setValue(from + (target - from) * ease(p));
      if (p < 1) raf = requestAnimationFrame(step);
      else fromRef.current = target;
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, reduced]);

  return value;
}

/**
 * Drag-to-scroll for horizontal rails. Pointer events only; native touch
 * scrolling is better than anything we would emulate, so touch is skipped.
 * A drag over 4px suppresses the click that follows, so dragging past a card
 * never navigates.
 */
export function useDragScroll<T extends HTMLElement>(): React.RefObject<T | null> {
  const ref = React.useRef<T>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let down = false;
    let startX = 0;
    let startLeft = 0;
    let moved = 0;

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      down = true;
      moved = 0;
      startX = e.clientX;
      startLeft = el.scrollLeft;
      el.classList.add('cursor-grabbing');
    };
    const end = () => {
      down = false;
      el.classList.remove('cursor-grabbing');
    };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      const dx = e.clientX - startX;
      moved = Math.abs(dx);
      el.scrollLeft = startLeft - dx;
      if (moved > 4) e.preventDefault();
    };
    const onClickCapture = (e: MouseEvent) => {
      if (moved > 4) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointerleave', end);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('click', onClickCapture, true);

    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', end);
      el.removeEventListener('pointerleave', end);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('click', onClickCapture, true);
    };
  }, []);

  return ref;
}

/**
 * Coin burst on a successful claim. 14 absolutely-positioned dots animating
 * transform+opacity only, appended to <body> (so no ancestor `overflow:hidden`
 * clips them) and removed on completion. Skipped entirely under reduced
 * motion — this is pure celebration and carries no information.
 */
export function useCoinBurst(): (anchor: HTMLElement | null) => void {
  const reduced = usePrefersReducedMotion();

  return React.useCallback(
    (anchor: HTMLElement | null) => {
      if (reduced || !anchor) return;
      const r = anchor.getBoundingClientRect();
      const host = document.createElement('div');
      host.style.cssText = `position:fixed;left:${r.left + r.width / 2}px;top:${
        r.top + r.height / 2
      }px;z-index:999;pointer-events:none`;

      // The four signature hues, read from the live token values so the burst
      // recolours with the theme.
      const styles = getComputedStyle(document.documentElement);
      const colors = ['--mint', '--violet', '--blue', '--warning'].map(
        (v) => styles.getPropertyValue(v).trim() || '#00E5A0',
      );

      for (let i = 0; i < 14; i++) {
        const dot = document.createElement('i');
        const a = (Math.PI * 2 * i) / 14 + Math.random() * 0.5;
        const dist = 42 + Math.random() * 46;
        dot.style.cssText = `position:absolute;width:7px;height:7px;border-radius:50%;
          background:${colors[i % 4]};transform:translate(-50%,-50%);
          animation:vf-burst 760ms cubic-bezier(.2,.7,.3,1) forwards;
          --tx:${Math.cos(a) * dist}px;--ty:${Math.sin(a) * dist - 18}px`;
        host.appendChild(dot);
      }

      document.body.appendChild(host);
      window.setTimeout(() => host.remove(), 820);
    },
    [reduced],
  );
}

/** Registers a global hotkey. `combo` is checked against `event.key`. */
export function useHotkey(
  key: string,
  handler: (e: KeyboardEvent) => void,
  { meta = true }: { meta?: boolean } = {},
): void {
  const saved = React.useRef(handler);
  saved.current = handler;

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== key.toLowerCase()) return;
      if (meta && !(e.metaKey || e.ctrlKey)) return;
      if (!meta && (e.metaKey || e.ctrlKey)) return;
      saved.current(e);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [key, meta]);
}

/** Countdown from a fixed number of seconds. Pauses at zero; does not loop. */
export function useCountdown(seconds: number, running = true): number {
  const [left, setLeft] = React.useState(seconds);

  React.useEffect(() => setLeft(seconds), [seconds]);

  React.useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setLeft((n) => (n <= 0 ? 0 : n - 1)), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  return left;
}

/** SSR-safe "are we on the client yet" flag, for anything that reads `window`
    during render (locale-dependent time strings, matchMedia defaults). */
export function useMounted(): boolean {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  return mounted;
}
