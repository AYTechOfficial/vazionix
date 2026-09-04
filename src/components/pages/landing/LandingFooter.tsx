'use client';

import Link from 'next/link';
import * as React from 'react';

import { brand } from '@/lib/brand';

/* ============================================================================
   LANDING FOOTER
   ----------------------------------------------------------------------------
   Client only because of the newsletter form, which is deliberately HONEST about
   what it does: there is no list provider wired, so submitting shows a message
   saying the address was not stored. A form that silently discards an email while
   thanking you for subscribing is worse than no form.

   Wire it by POSTing to your provider from a Route Handler and replacing
   `onSubmit` — the markup does not need to change.
   ========================================================================== */

export function LandingFooter() {
  const [email, setEmail] = React.useState('');
  const [state, setState] = React.useState<'idle' | 'invalid' | 'noted'>('idle');

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes('@') || email.indexOf('@') < 1) {
      setState('invalid');
      return;
    }
    setState('noted');
  };

  return (
    <footer className="foot">
      <div className="container">
        <div className="foot__grid">
          <div>
            <Link className="brand" href="/register" aria-label="{brand.name} — home">
              <svg className="brand__mark" viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false">
                <rect x="0.75" y="0.75" width="30.5" height="30.5" rx="8.5" stroke="url(#vfg)" strokeOpacity="0.42" strokeWidth="1.5" />
                <path d="M6.5 8.5h4.1l3.6 10.9 3.6-10.9h4.1l-5.7 15h-4z" fill="url(#vfg)" />
                <path d="M20.4 23.5V15h6.1v2.7h-3.3v1.7h3v2.6h-3v1.5z" fill="url(#vfg)" fillOpacity="0.85" />
              </svg>
              <span className="brand__name">{brand.name}</span>
            </Link>
            <p className="foot__brandtxt">{brand.tagline} Twelve assets across three payout rails, with every fee shown before you confirm.</p>

            <form className="news" id="news" noValidate={true} onSubmit={onSubmit}>
              <label className="label" htmlFor="newsEmail">Payout & feature updates</label>
              <div className="news__row" style={{ marginTop: 'var(--s-2)' }}>
                <input
                  className="input"
                  id="newsEmail"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  required={true}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setState('idle');
                  }}
                  aria-invalid={state === 'invalid'}
                />
                <button className="btn btn--primary news__btn" id="newsBtn" type="submit">
                  <span className="news__lbl">Subscribe</span>
                  <span className="news__chk"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="m4.5 12.5 5 5 10-11" /></svg></span>
                </button>
              </div>
              <p className="news__ok" role="status">{state === 'noted' ? `Noted — ${email}. Nothing was stored: no mailing list is connected yet.` : ''}</p>
            </form>

            <div className="socials">
              <a className="soc" href="https://t.me/vazionix" target="_blank" rel="noopener noreferrer" aria-label="Telegram channel"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M21.5 3.5 2.8 10.8l5.4 1.7 2 6 2.8-3.6 4.6 3.4z" /><path d="m8.2 12.5 9-6.5-6.3 7.3" /></svg></a>
              <a className="soc" href="https://x.com/vazionix" target="_blank" rel="noopener noreferrer" aria-label="{brand.name} on X"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M3 3h4l5.5 7.5L18 3h3l-7.2 9.3L21.5 21H17l-5.2-7L5.5 21h-3l7.6-9.6z" /></svg></a>
              <a className="soc" href="https://www.facebook.com/vazionix" target="_blank" rel="noopener noreferrer" aria-label="Facebook page"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M14.5 8.5V6.8c0-.8.5-1.3 1.3-1.3h1.7V2.6h-2.6c-2.6 0-4 1.6-4 4.1v1.8H8.5v3h2.4V21h3.6v-9.5h2.5l.5-3z" /></svg></a>
              <a className="soc" href="https://discord.gg/vazionix" target="_blank" rel="noopener noreferrer" aria-label="Discord server"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M8.5 6.5C6 7 4.2 8.4 3.5 10c-1 3.2-1 6 0 8.5 1.2.9 2.6 1.4 4 1.5l.9-1.6" /><path d="M15.5 6.5c2.5.5 4.3 1.9 5 3.5 1 3.2 1 6 0 8.5-1.2.9-2.6 1.4-4 1.5l-.9-1.6" /><path d="M8.5 6.5 9 5c2-.4 4-.4 6 0l.5 1.5" /><circle cx="9.2" cy="13.5" r="1.3" /><circle cx="14.8" cy="13.5" r="1.3" /><path d="M7.5 17.5c3 1.3 6 1.3 9 0" /></svg></a>
              <a className="soc" href="https://www.youtube.com/@vazionix" target="_blank" rel="noopener noreferrer" aria-label="YouTube channel"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><rect x="2.5" y="5.5" width="19" height="13" rx="4" /><path d="m10.5 9.5 5 2.5-5 2.5z" /></svg></a>
            </div>
          </div>

          <nav aria-labelledby="ft-earn"><p className="foot__t" id="ft-earn">Earn</p>
            <div className="foot__l">
              <a href="#earn">Faucet</a><a href="#earn">Paid to click</a><a href="#earn">Shortlinks</a>
              <a href="#earn">Offerwall</a><a href="#earn">Lottery</a><a href="#earn">Challenges</a>
            </div>
          </nav>
          <nav aria-labelledby="ft-pay"><p className="foot__t" id="ft-pay">Payouts</p>
            <div className="foot__l">
              <a href="#payouts">FaucetPay</a><a href="#payouts">CWallet</a><a href="#payouts">Direct on-chain</a>
              <a href="#payouts">Minimums & fees</a><a href="#proof">Payout history</a>
            </div>
          </nav>
          <nav aria-labelledby="ft-co"><p className="foot__t" id="ft-co">Company</p>
            <div className="foot__l">
              <a href="#security">Security</a><a href="#advertise">Advertise with us</a>
              <a href="#faq">Support</a><a href="#proof">Leaderboard</a>
            </div>
          </nav>
          <nav aria-labelledby="ft-lg"><p className="foot__t" id="ft-lg">Legal</p>
            <div className="foot__l">
              <Link href="/register">Terms of service</Link><Link href="/register">Privacy policy</Link>
              <Link href="/register">Fair play policy</Link><Link href="/register">Cookie notice</Link>
            </div>
          </nav>
          <nav aria-labelledby="ft-cm"><p className="foot__t" id="ft-cm">Community</p>
            <div className="foot__l">
              <a href="https://t.me/vazionix" target="_blank" rel="noopener noreferrer">Telegram</a>
              <a href="https://discord.gg/vazionix" target="_blank" rel="noopener noreferrer">Discord</a>
              <a href="https://www.facebook.com/vazionix" target="_blank" rel="noopener noreferrer">Facebook</a>
              <a href="https://x.com/vazionix" target="_blank" rel="noopener noreferrer">X</a>
            </div>
          </nav>
        </div>

        <div className="foot__bar">
          <span>© 2020–2026 {brand.name}. All rights reserved.</span>
          <span className="row gap-4 wrap">
            <span className="row gap-2"><span className="live-dot"></span>All payout rails operational</span>
            <span className="mono">v4.2</span>
          </span>
        </div>
      </div>
    </footer>
  );
}
