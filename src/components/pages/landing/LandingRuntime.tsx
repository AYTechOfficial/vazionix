'use client';

import * as React from 'react';

import type { PayoutTickerRow } from '@/lib/models';

/* ============================================================================
   LANDING RUNTIME — the prototype's GSAP layer, ported
   ----------------------------------------------------------------------------
   THE CONTRACT THIS FILE KEEPS: the page is complete and readable with this
   component absent. Nothing here creates content; it only enhances. Every
   element it touches already renders its final state in CSS, which is why the
   `[data-reveal]` pre-state rule is scoped to `.js` — set by this file on mount,
   so a visitor with JavaScript off never sees a hidden element that never
   un-hides.

   WHAT RUNS
     reveal      one ScrollTrigger per group with an internal stagger, not one per
                 element. Nine triggers total, plus the single pinned section.
     counters    tween plain objects and format per frame; a DOM string cannot be
                 tweened, and formatting on each frame is what keeps the thousands
                 separator correct mid-count.
     spotlight   two custom properties eased on one rAF, no DOM restyle.
     magnetic    four elements only. Outer 0.4, inner text 0.65, so the label
                 leads the button and the whole thing reads as weight.
     device      tilt (mouse) and bob (idle) own SEPARATE elements, because two
                 tweens fighting over one transform matrix produces jitter.
     marquee     duplicated track, xPercent -50, seamless. Hover and the button
                 both pause it; the button wins over hover.
     pin         the one pinned section. Four panels crossfade over 300% scroll.
     faq         accordion with a measured max-height, remeasured on resize.
     ticker      real completed withdrawals, re-aged as rows shift down.

   REDUCED MOTION IS A BRANCH, NOT A SPEED
   Everything lives inside `gsap.matchMedia()`, so under `prefers-reduced-motion:
   reduce` the tweens are never constructed in the first place — the reduce branch
   sets final state and returns. Turning durations down to zero would still build
   the timelines and still pin the viewport.
   ========================================================================== */

const MAX_MAGNETIC = 4;
const TICKER_ROWS = 7;
const TICKER_INTERVAL_MS = 3200;

export function LandingRuntime({ ticker }: { ticker: PayoutTickerRow[] }) {
  React.useEffect(() => {
    const doc = document;
    const root = doc.documentElement;

    /* The pre-state rule for reveals is gated on `.js`. Adding the class here —
       rather than in the server HTML — is what guarantees a no-JS visitor never
       gets a permanently invisible section. */
    root.classList.add('js');

    let disposed = false;
    const cleanups: Array<() => void> = [];

    const $ = <T extends Element = HTMLElement>(sel: string) => doc.querySelector<T>(sel);
    const $$ = <T extends Element = HTMLElement>(sel: string, c: ParentNode = doc) =>
      Array.from(c.querySelectorAll<T>(sel));

    /* ---- FAQ: no GSAP needed, so it runs regardless ---------------------- */
    const faqButtons = $$<HTMLButtonElement>('.vz-lp .faq__q');
    const faqHandlers: Array<[HTMLButtonElement, () => void]> = [];

    const panelFor = (btn: HTMLButtonElement) => {
      const id = btn.getAttribute('aria-controls');
      return id ? doc.getElementById(id) : null;
    };

    for (const btn of faqButtons) {
      const handler = () => {
        const open = btn.getAttribute('aria-expanded') === 'true';
        /* One panel at a time: two open answers push the question you were
           reading off screen. */
        for (const other of faqButtons) {
          if (other === btn) continue;
          other.setAttribute('aria-expanded', 'false');
          const op = panelFor(other);
          if (op) {
            op.style.maxHeight = '0px';
            op.style.opacity = '0';
          }
        }
        btn.setAttribute('aria-expanded', open ? 'false' : 'true');
        const panel = panelFor(btn);
        if (panel) {
          panel.style.maxHeight = open ? '0px' : `${panel.scrollHeight}px`;
          panel.style.opacity = open ? '0' : '1';
        }
      };
      btn.addEventListener('click', handler);
      faqHandlers.push([btn, handler]);
    }

    /* An open panel's measured height is wrong the moment the answer reflows. */
    const onResize = () => {
      for (const btn of faqButtons) {
        if (btn.getAttribute('aria-expanded') !== 'true') continue;
        const panel = panelFor(btn);
        if (panel) panel.style.maxHeight = `${panel.scrollHeight}px`;
      }
    };
    window.addEventListener('resize', onResize);

    cleanups.push(() => {
      window.removeEventListener('resize', onResize);
      for (const [btn, handler] of faqHandlers) btn.removeEventListener('click', handler);
    });

    /* ---- MOTION ---------------------------------------------------------- */
    void (async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import('gsap'),
        import('gsap/ScrollTrigger'),
      ]);
      if (disposed) return;
      gsap.registerPlugin(ScrollTrigger);

      const fine = window.matchMedia('(pointer: fine)');

      /** One trigger per group with an internal stagger. `fromTo`, not `from`:
          the pre-state is already `opacity: 0` in CSS, so `from` would record 0
          as the END value and animate nothing. `clearProps` clears only
          transform, because clearing opacity would re-expose the pre-state rule
          and re-hide the element. */
      const group = (sel: string, itemSel: string | null, stagger = 0.07, start = 'top 84%') => {
        const container = $(sel);
        if (!container) return;
        const items = itemSel ? $$(itemSel, container) : [container];
        if (!items.length) return;
        gsap.fromTo(
          items,
          { opacity: 0, y: 16 },
          {
            opacity: 1,
            y: 0,
            duration: 0.72,
            ease: 'power2.out',
            stagger,
            clearProps: 'transform',
            scrollTrigger: { trigger: container, start, once: true },
          },
        );
      };

      const buildTicker = (live: boolean): number | null => {
        const list = $('#tickList');
        if (!list) return null;
        if (!ticker.length) return null;

        const ROW_H = 58;
        let cursor = 0;

        const row = (d: PayoutTickerRow, ageLabel: string) => {
          const el = doc.createElement('div');
          el.className = 'tick__row';
          const flag = doc.createElement('span');
          flag.className = 'flag';
          flag.setAttribute('aria-hidden', 'true');
          flag.textContent = d.countryCode;
          const mid = doc.createElement('span');
          const u = doc.createElement('span');
          u.className = 'tick__u';
          u.textContent = d.username;
          const m = doc.createElement('span');
          m.className = 'tick__m';
          m.textContent = 'withdrew successfully';
          mid.append(u, doc.createElement('br'), m);
          const amt = doc.createElement('span');
          amt.className = 'tick__amt';
          const n = doc.createElement('span');
          n.className = 'num';
          n.textContent = `${d.amount} ${d.coin}`;
          const em = doc.createElement('em');
          em.textContent = ageLabel;
          amt.append(n, em);
          el.append(flag, mid, amt);
          return el;
        };

        list.replaceChildren();
        for (let i = 0; i < Math.min(TICKER_ROWS, ticker.length); i++) {
          const d = ticker[i % ticker.length]!;
          list.appendChild(row(d, i === 0 ? 'just now' : `${i}m ago`));
          cursor = i + 1;
        }
        if (!live || ticker.length < 2) return null;

        return window.setInterval(() => {
          const d = ticker[cursor % ticker.length]!;
          cursor += 1;
          const el = row(d, 'just now');
          list.insertBefore(el, list.firstChild);
          gsap.fromTo(list, { y: -ROW_H }, { y: 0, duration: 0.62, ease: 'power3.out' });
          gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.45, delay: 0.12 });
          /* Re-age the rows below, so the feed reads as time passing rather than
             as a list that reshuffles. */
          $$<HTMLElement>('.tick__row em', list).forEach((em, i) => {
            if (i === 0) return;
            em.textContent = i < 2 ? `${i * 14}s ago` : `${Math.max(1, i - 1)}m ago`;
          });
          while (list.children.length > TICKER_ROWS + 1) list.removeChild(list.lastChild!);
        }, TICKER_INTERVAL_MS);
      };

      const mm = gsap.matchMedia();

      /* ---- REDUCE: final state, no tweens constructed ------------------- */
      mm.add('(prefers-reduced-motion: reduce)', () => {
        gsap.set('.vz-lp [data-reveal]', { opacity: 1, y: 0, clearProps: 'transform' });
        gsap.set('#devTilt', {
          transformPerspective: 1500,
          rotateY: -13,
          rotateX: 6,
          transformOrigin: '50% 50%',
        });
        gsap.set('#howRail', { scaleY: 1 });
        /* No pin and no scrub: CSS un-stacks the four panels so every one is
           readable in document flow, and every step reads as active. */
        $$('.vz-lp .how__step').forEach((s) => s.classList.add('is-on'));
        buildTicker(false);
        const toggle = $('#mqToggle');
        if (toggle) toggle.style.display = 'none';
        /* Counters render their final value rather than counting up. */
        $$<HTMLElement>('.vz-lp [data-count]').forEach((el) => {
          el.textContent = formatCount(
            Number(el.getAttribute('data-count')) || 0,
            el.getAttribute('data-format'),
          );
        });
        return () => {};
      });

      /* ---- FULL MOTION -------------------------------------------------- */
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const local: Array<() => void> = [];
        const tickerId = buildTicker(true);

        gsap.fromTo(
          '.vz-lp .hero__copy [data-reveal]',
          { opacity: 0, y: 16 },
          { opacity: 1, y: 0, duration: 0.8, ease: 'power2.out', stagger: 0.09, delay: 0.1, clearProps: 'transform' },
        );
        gsap.fromTo(
          '.vz-lp .hero__visual',
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 1.1, ease: 'power2.out', delay: 0.3, clearProps: 'transform' },
        );

        group('#bento', '[data-bcard]', 0.06);
        group('#proof .proof__grid', ':scope > *', 0.12);
        group('#sgrid', '.scard', 0.07);
        group('#payouts .rails', '.rail-c', 0.1);
        group('#payouts .orbit', null);
        group('.vz-lp .sim', null);
        group('#faqList', '.faq__i', 0.05);
        group('.vz-lp .fcta__in', '[data-reveal]', 0.09);

        /* Counters: one trigger, one tween per element over a plain object. */
        const counters = $$<HTMLElement>('.vz-lp [data-count]');
        if (counters.length) {
          const tl = gsap.timeline({
            scrollTrigger: { trigger: '.vz-lp .counters', start: 'top 88%', once: true },
          });
          for (const el of counters) {
            const target = Number(el.getAttribute('data-count')) || 0;
            const fmt = el.getAttribute('data-format');
            const box = { v: 0 };
            el.textContent = formatCount(0, fmt);
            tl.to(
              box,
              {
                v: target,
                duration: 1.9,
                ease: 'power1.out',
                onUpdate: () => {
                  el.textContent = formatCount(box.v, fmt);
                },
                onComplete: () => {
                  el.textContent = formatCount(target, fmt);
                },
              },
              0,
            );
          }
        }

        /* Cursor spotlight: two custom properties, eased on a single rAF. */
        if (fine.matches) {
          const spot = $('#heroSpot');
          const hero = $('.vz-lp .hero');
          if (spot && hero) {
            let tx = 50;
            let ty = 30;
            let cx = 50;
            let cy = 30;
            let raf = 0;
            let running = false;

            const loop = () => {
              cx += (tx - cx) * 0.12;
              cy += (ty - cy) * 0.12;
              root.style.setProperty('--mx', `${cx.toFixed(2)}%`);
              root.style.setProperty('--my', `${cy.toFixed(2)}%`);
              if (Math.abs(tx - cx) > 0.05 || Math.abs(ty - cy) > 0.05) {
                raf = window.requestAnimationFrame(loop);
              } else {
                running = false;
              }
            };
            const onMove = (e: MouseEvent) => {
              const r = hero.getBoundingClientRect();
              tx = ((e.clientX - r.left) / r.width) * 100;
              ty = ((e.clientY - r.top) / r.height) * 100;
              spot.classList.add('is-live');
              if (!running) {
                running = true;
                raf = window.requestAnimationFrame(loop);
              }
            };
            const onLeave = () => spot.classList.remove('is-live');

            hero.addEventListener('mousemove', onMove);
            hero.addEventListener('mouseleave', onLeave);
            local.push(() => {
              hero.removeEventListener('mousemove', onMove);
              hero.removeEventListener('mouseleave', onLeave);
              window.cancelAnimationFrame(raf);
            });
          }
        }

        /* Magnetic buttons. Capped at four: the effect is a signal, and every
           button having it makes it noise. */
        if (fine.matches) {
          for (const el of $$('.vz-lp [data-mag]').slice(0, MAX_MAGNETIC)) {
            const inner = el.querySelector<HTMLElement>('.mag__in') ?? el;
            const ox = gsap.quickTo(el, 'x', { duration: 1, ease: 'elastic.out(1, 0.3)' });
            const oy = gsap.quickTo(el, 'y', { duration: 1, ease: 'elastic.out(1, 0.3)' });
            const ix = gsap.quickTo(inner, 'x', { duration: 1, ease: 'elastic.out(1, 0.3)' });
            const iy = gsap.quickTo(inner, 'y', { duration: 1, ease: 'elastic.out(1, 0.3)' });

            const move = (ev: MouseEvent) => {
              const b = el.getBoundingClientRect();
              const dx = ev.clientX - (b.left + b.width / 2);
              const dy = ev.clientY - (b.top + b.height / 2);
              ox(dx * 0.4);
              oy(dy * 0.4);
              ix(dx * 0.65 - dx * 0.4);
              iy(dy * 0.65 - dy * 0.4);
            };
            const leave = () => {
              ox(0);
              oy(0);
              ix(0);
              iy(0);
            };
            el.addEventListener('mousemove', move);
            el.addEventListener('mouseleave', leave);
            local.push(() => {
              el.removeEventListener('mousemove', move);
              el.removeEventListener('mouseleave', leave);
            });
          }
        }

        /* Device mockup: tilt and bob on separate elements. */
        const tilt = $('#devTilt');
        const bob = $('#devBob');
        if (tilt && bob) {
          gsap.set(tilt, {
            transformPerspective: 1500,
            transformOrigin: '50% 50%',
            rotateY: -13,
            rotateX: 6,
          });
          gsap.to(bob, { y: -14, duration: 4.2, ease: 'sine.inOut', repeat: -1, yoyo: true });
          if (fine.matches) {
            const ry = gsap.quickTo(tilt, 'rotateY', { duration: 0.9, ease: 'power3.out' });
            const rx = gsap.quickTo(tilt, 'rotateX', { duration: 0.9, ease: 'power3.out' });
            const devMove = (e: MouseEvent) => {
              ry(-13 + (e.clientX / window.innerWidth - 0.5) * 14);
              rx(6 - (e.clientY / window.innerHeight - 0.5) * 10);
            };
            window.addEventListener('mousemove', devMove);
            local.push(() => window.removeEventListener('mousemove', devMove));
          }
        }

        /* Marquee: clone the track once, then translate by half. */
        const track = $('#mqTrack');
        let mqTween: gsap.core.Tween | null = null;
        if (track) {
          const set = track.firstElementChild;
          if (set && track.children.length === 1) track.appendChild(set.cloneNode(true));
          mqTween = gsap.to(track, { xPercent: -50, duration: 34, ease: 'none', repeat: -1 });

          const marquee = $('#marquee');
          const toggle = $<HTMLButtonElement>('#mqToggle');
          let manualPause = false;

          if (marquee) {
            const enter = () => {
              if (!manualPause) mqTween?.pause();
            };
            const leave = () => {
              if (!manualPause) mqTween?.resume();
            };
            marquee.addEventListener('mouseenter', enter);
            marquee.addEventListener('mouseleave', leave);
            local.push(() => {
              marquee.removeEventListener('mouseenter', enter);
              marquee.removeEventListener('mouseleave', leave);
            });
          }

          if (toggle) {
            const label = $('#mqLabel');
            const onToggle = () => {
              manualPause = !manualPause;
              if (manualPause) mqTween?.pause();
              else mqTween?.resume();
              toggle.classList.toggle('is-paused', manualPause);
              toggle.setAttribute('aria-pressed', manualPause ? 'true' : 'false');
              toggle.setAttribute(
                'aria-label',
                manualPause ? 'Resume the scrolling asset list' : 'Pause the scrolling asset list',
              );
              if (label) label.textContent = manualPause ? 'Play' : 'Pause';
            };
            toggle.addEventListener('click', onToggle);
            local.push(() => toggle.removeEventListener('click', onToggle));
          }
        }

        /* The one pinned section. */
        let pinTl: gsap.core.Timeline | null = null;
        const panels = $$('.vz-lp .how__panel');
        const steps = $$('.vz-lp .how__step');
        if (panels.length > 1) {
          gsap.set(panels, { opacity: 0, y: 24 });
          gsap.set(panels[0]!, { opacity: 1, y: 0 });

          pinTl = gsap.timeline({
            scrollTrigger: {
              trigger: '#how',
              start: 'top top',
              end: '+=300%',
              pin: '#howPin',
              scrub: 1,
              anticipatePin: 1,
              onUpdate: (self) => {
                /* ROUND, not floor: each crossfade completes at i/(n-1) of
                   progress, and rounding is what keeps the highlighted step and
                   the visible illustration describing the same thing. */
                const i = Math.round(self.progress * (panels.length - 1));
                steps.forEach((s, k) => s.classList.toggle('is-on', k === i));
              },
            },
          });
          for (let i = 1; i < panels.length; i++) {
            pinTl
              .to(panels[i - 1]!, { opacity: 0, y: -24, duration: 0.45, ease: 'power1.in' })
              .to(panels[i]!, { opacity: 1, y: 0, duration: 0.55, ease: 'power1.out' });
          }
          pinTl.to('#howRail', { scaleY: 1, ease: 'none', duration: pinTl.duration() || 1 }, 0);
        }

        return () => {
          if (tickerId) window.clearInterval(tickerId);
          mqTween?.kill();
          if (pinTl) {
            pinTl.scrollTrigger?.kill();
            pinTl.kill();
          }
          for (const fn of local) fn();
        };
      });

      cleanups.push(() => mm.revert());
    })();

    return () => {
      disposed = true;
      root.classList.remove('js');
      for (const fn of cleanups) fn();
    };
  }, [ticker]);

  return null;
}

/** Counter formats. Kept beside the runtime because the `data-format` attribute
    in the hero markup is the other half of this switch. */
function formatCount(value: number, format: string | null): string {
  switch (format) {
    case 'usdShort':
      return value >= 1_000_000
        ? `$${(value / 1e6).toFixed(1)}M+`
        : value >= 1000
          ? `$${(value / 1e3).toFixed(1)}K`
          : `$${value.toFixed(0)}`;
    case 'short':
      return value >= 1_000_000
        ? `${(value / 1e6).toFixed(1)}M+`
        : value >= 1000
          ? `${(value / 1e3).toFixed(1)}K`
          : `${Math.round(value)}`;
    default:
      return Math.round(value).toLocaleString('en-US');
  }
}
