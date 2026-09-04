'use client';

import Link from 'next/link';
import * as React from 'react';

import { brand } from '@/lib/brand';
import { useTheme } from '@/lib/theme';

/* ============================================================================
   LANDING NAV
   ----------------------------------------------------------------------------
   Client for three reasons and no others: the sticky shadow needs a scroll
   listener, the mobile drawer needs open state, and the theme toggle has to reach
   the app's own provider.

   THE THEME TOGGLE DOES NOT USE THE PROTOTYPE'S IMPLEMENTATION.
   The prototype wrote `localStorage['vf-theme']` and set `data-theme` on `<html>`
   itself. This app already owns that: `ThemeProvider` writes the `vazionix-theme`
   cookie so the SERVER can render the right theme in the first paint. Two writers
   would fight over the attribute, and only one of them is readable server-side.

   The drawer state also locks body scroll and closes on Escape — a full-screen
   overlay you can scroll the page behind is a trap on a phone.
   ========================================================================== */

export function LandingNav() {
  const { theme, toggleTheme } = useTheme();
  const [stuck, setStuck] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);

  React.useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        ticking = false;
        setStuck(window.scrollY > 12);
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  React.useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <>
      <header className={`nav${stuck ? ' is-stuck' : ''}`} id="nav">
        <div className="container nav__in">
          <Link className="brand" href="/" aria-label={`${brand.name} — home`}>
            {/* VF monogram: angular V/F ligature, signature gradient. Authored here. */}
            <svg className="brand__mark" viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false">
              <rect x="0.75" y="0.75" width="30.5" height="30.5" rx="8.5" stroke="url(#vfg)" strokeOpacity="0.42" strokeWidth="1.5" />
              <path d="M6.5 8.5h4.1l3.6 10.9 3.6-10.9h4.1l-5.7 15h-4z" fill="url(#vfg)" />
              <path d="M20.4 23.5V15h6.1v2.7h-3.3v1.7h3v2.6h-3v1.5z" fill="url(#vfg)" fillOpacity="0.85" />
            </svg>
            <span className="brand__name">{brand.name}</span>
          </Link>

          <nav className="nav__links" aria-label="Primary">
            <a className="nav__link" href="#earn">Earn</a>
            <a className="nav__link" href="#how">How it works</a>
            <a className="nav__link" href="#payouts">Payouts</a>
            <a className="nav__link" href="#advertise">Advertise</a>
            <a className="nav__link" href="#faq">FAQ</a>
          </nav>

          <div className="nav__right">
            <button
              className="tt"
              id="themeToggle"
              type="button"
              onClick={toggleTheme}
              aria-pressed={theme === 'light'}
              aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
            >
              <svg className="tt__sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4.2" /><path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8 6 18M18 6l1.8-1.8" /></svg>
              <svg className="tt__moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" /></svg>
            </button>
            <Link className="btn btn--ghost nav__signin" href="/login">Sign in</Link>
            <Link className="btn btn--primary mag" href="/register" data-mag={true}><span className="mag__in">Start earning</span></Link>
            <button className="btn btn--secondary btn--icon burger" id="burger" type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu" aria-expanded={menuOpen} aria-controls="mnav">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true" focusable="false"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
            </button>
          </div>
        </div>
      </header>
      <div className={`mnav${menuOpen ? ' is-open' : ''}`} id="mnav" role="dialog" aria-modal="true" aria-label="Menu">
        <div className="container">
          <div className="mnav__top">
            <span className="brand"><svg className="brand__mark" viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false"><path d="M6.5 8.5h4.1l3.6 10.9 3.6-10.9h4.1l-5.7 15h-4z" fill="url(#vfg)" /><path d="M20.4 23.5V15h6.1v2.7h-3.3v1.7h3v2.6h-3v1.5z" fill="url(#vfg)" fillOpacity="0.85" /></svg><span className="brand__name">{brand.name}</span></span>
            <button className="btn btn--secondary btn--icon" id="mnavClose" type="button" onClick={() => setMenuOpen(false)} aria-label="Close menu" style={{ marginLeft: 'auto' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true" focusable="false"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
          <ul className="mnav__list">
            <li><a className="mnav__link" href="#earn">Earn</a></li>
            <li><a className="mnav__link" href="#how">How it works</a></li>
            <li><a className="mnav__link" href="#payouts">Payouts</a></li>
            <li><a className="mnav__link" href="#advertise">Advertise</a></li>
            <li><a className="mnav__link" href="#faq">FAQ</a></li>
          </ul>
          <div className="mnav__cta">
            <Link className="btn btn--gradient btn--lg btn--block" href="/register">Start earning free crypto</Link>
            <Link className="btn btn--secondary btn--lg btn--block" href="/login">Sign in</Link>
          </div>
        </div>
      </div>
    </>
  );
}
