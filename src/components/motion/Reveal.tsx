'use client';

import * as React from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import { cn } from '@/lib/utils';

/* ============================================================================
   REVEAL ON SCROLL — GSAP + ScrollTrigger
   ----------------------------------------------------------------------------
   Why GSAP here and Framer Motion elsewhere: Framer Motion is excellent for
   component-local, state-driven transitions (a modal, a toast, a layout
   shift). It is the wrong tool for "animate N siblings in sequence as a
   container crosses the viewport" — `whileInView` creates one IntersectionObserver
   per element and cannot express a shared, scrubbed timeline. ScrollTrigger
   creates ONE observer for the batch.

   REDUCED MOTION
     Everything is inside `gsap.matchMedia()`. That is not decoration: a CSS
     `transition-duration: 0.01ms` override cannot stop a GSAP tween, because
     GSAP writes inline styles frame by frame. matchMedia gives us two real
     branches — the animated one, and one that simply sets the final state —
     and it TEARS DOWN the animated branch's tweens and ScrollTriggers if the
     user flips the OS setting mid-session. `mm.revert()` on unmount then
     restores every property GSAP touched, so React never inherits a stray
     inline transform.
   ========================================================================== */

gsap.registerPlugin(ScrollTrigger);

export interface RevealProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Stagger children instead of the container itself. */
  stagger?: boolean;
  /** Selector for the staggered children. Defaults to direct children. */
  childSelector?: string;
  delay?: number;
}

export function Reveal({
  children,
  className,
  stagger = false,
  childSelector,
  delay = 0,
  ...props
}: RevealProps) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const mm = gsap.matchMedia();

    mm.add(
      {
        motionOk: '(prefers-reduced-motion: no-preference)',
        motionReduced: '(prefers-reduced-motion: reduce)',
      },
      (context) => {
        const { motionReduced } = context.conditions as { motionOk: boolean; motionReduced: boolean };

        const targets: gsap.TweenTarget = stagger
          ? el.querySelectorAll(childSelector ?? ':scope > *')
          : el;

        if (motionReduced) {
          // Final state, instantly. No tween, no ScrollTrigger, no observer.
          gsap.set(targets, { opacity: 1, y: 0, clearProps: 'transform' });
          return;
        }

        gsap.fromTo(
          targets,
          { opacity: 0, y: 14 },
          {
            opacity: 1,
            y: 0,
            duration: 0.62,
            delay,
            ease: 'power2.out',
            stagger: stagger ? 0.06 : 0,
            scrollTrigger: {
              trigger: el,
              // Fire slightly before the element is fully in view, so the
              // motion reads as "already happening" rather than "triggered".
              start: 'top 92%',
              once: true,
            },
          },
        );
      },
    );

    // Reverts every tween AND every inline style GSAP wrote. Without this a
    // route change can leave an element stuck at opacity 0.
    return () => mm.revert();
  }, [stagger, childSelector, delay]);

  return (
    <div ref={ref} className={cn(className)} {...props}>
      {children}
    </div>
  );
}
