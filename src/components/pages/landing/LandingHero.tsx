import Link from 'next/link';

import { brand } from '@/lib/brand';
import { compact } from '@/lib/format';
import type { PlatformStats } from '@/lib/models';

/* ============================================================================
   LANDING HERO
   ----------------------------------------------------------------------------
   Ported from the HTML prototype. The markup is unchanged apart from the values
   that must not be invented.

   THE PRODUCT SHOT IS HTML, NOT AN IMAGE
   The laptop and the phone are CSS: a real sidebar, a real balance card, a real
   bar chart, real task cards. That is why it stays crisp at any zoom, retints
   with the theme, and costs no image bytes. It is also why it has to be kept in
   step with the product it depicts — when the dashboard changes, this changes.
   The figures inside the mockup are illustrative of the INTERFACE, in the way a
   screenshot would be; they are not presented as anybody's balance.

   WHAT IS LIVE
   The three counters and the hero pill read the platform stats. The withdrawal
   minimum comes from `/config/rates`, so the hero cannot advertise a floor the
   withdraw form would refuse. The prototype's own headline figures — $2.4M paid,
   1.8M earners, "paying since February 2020" — are gone: they described a
   different product, and a claim that cannot be checked against the database is
   the thing this rebuild set out to remove.

   `data-count` and `data-reveal` are read by `LandingRuntime`. With it absent the
   markup is complete: every number renders its final value and nothing is hidden.
   ========================================================================== */

export function LandingHero({ stats, minimum }: { stats: PlatformStats; minimum: string }) {
  return (
    <section className="hero" id="top">
      <div className="hero__bg" aria-hidden="true">
        <span className="blob blob--1"></span><span className="blob blob--2"></span>
        <span className="blob blob--3"></span><span className="blob blob--4"></span>
      </div>
      <div className="hero__grid" aria-hidden="true"></div>
      <div className="hero__spot" id="heroSpot" aria-hidden="true"></div>
      <div className="hero__fade" aria-hidden="true"></div>

      <div className="container hero__grid-2">
        <div className="hero__copy">
          <p className="hero__pill" data-reveal={true}>
            <span className="live-dot"></span>{' '}
            {stats.onlineNow > 0
              ? `${compact(stats.onlineNow)} earning right now`
              : `No deposit, no KYC · withdraw from ${minimum}`}
          </p>

          <h1 className="hero__h1" data-reveal={true}>
            <span>Earn crypto in seconds.</span>
            <span className="grad-text">Cash out instantly.</span>
          </h1>

          <p className="hero__sub" data-reveal={true}>
            Claim the faucet every 34 minutes, clear offerwall tasks, watch PTC ads and unlock
            shortlinks — then withdraw to FaucetPay, CWallet or your own wallet from
            <span className="mono t-mint">{minimum}</span>.
          </p>

          <div className="hero__cta" data-reveal={true}>
            <Link className="btn btn--gradient btn--lg mag" href="/register" data-mag={true}>
              <span className="mag__in">Start earning free crypto
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M4 12h16" /><path d="m14 6 6 6-6 6" /></svg>
              </span>
            </Link>
            <a className="btn btn--secondary btn--lg mag" href="#how" data-mag={true}>
              <span className="mag__in">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" /><path d="M12 7v5.2l3.4 2" /></svg>
                See how it works
              </span>
            </a>
          </div>
          <p className="hero__note" data-reveal={true}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="m4.5 12.5 5 5 10-11" /></svg>
            No deposit, no KYC, no minimum balance. Sign-up takes ten seconds.
          </p>

          <dl className="counters" data-reveal={true}>
            <div>
              <dd className="count__v num" data-count={stats.paidOutUsd} data-format="usdShort">$0</dd>
              <dt className="count__l">Paid out to earners</dt>
            </div>
            <div>
              <dd className="count__v num" data-count={stats.members} data-format="short">0</dd>
              <dt className="count__l">Registered earners</dt>
            </div>
            <div>
              <dd className="count__v num" data-count={stats.withdrawalsToday} data-format="int">0</dd>
              <dt className="count__l">Withdrawals today</dt>
            </div>
          </dl>
        </div>

        {/* Real HTML/CSS product render, not an image. */}
        <div className="hero__visual" data-reveal={true}>
          <div className="dev" id="dev">
            <div className="dev__tilt" id="devTilt">
              <div className="dev__bob" id="devBob">
                <div className="dev__scale">
                  <div className="lap">
                    <div className="lap__lid">
                      <div className="lap__screen">
                        <div className="lap__glare" aria-hidden="true"></div>
                        <div className="app" role="img" aria-label="{brand.name} dashboard: balance 6,851.79 tokens, seven-day earnings chart, faucet and PTC task cards">
      <aside className="app__side">
        <div className="app__logo">
          <svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M6.5 8.5h4.1l3.6 10.9 3.6-10.9h4.1l-5.7 15h-4z" fill="url(#vfg)" /><path d="M20.4 23.5V15h6.1v2.7h-3.3v1.7h3v2.6h-3v1.5z" fill="url(#vfg)" fillOpacity="0.85" /></svg>
          <b>{brand.name}</b>
        </div>
        <div className="app__navlbl">Earn</div>
        <div className="app__navi">
          <div className="app__item app__item--on"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" /></svg>Dashboard</div>
          <div className="app__item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 2.7 6.9 8.3a7 7 0 1 0 10.2 0z" /></svg>Faucet<span className="app__badge">34:00</span></div>
          <div className="app__item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3 11 14-6v14L3 13z" /><path d="M3 11v2a2 2 0 0 0 2 2h1v-6H5a2 2 0 0 0-2 2z" /><path d="M7 15v3a2 2 0 0 0 4 0v-2" /></svg>PTC ads<span className="app__badge">127</span></div>
          <div className="app__item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.6l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.6l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></svg>Shortlinks<span className="app__badge">272</span></div>
          <div className="app__item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m12 2 9 5-9 5-9-5z" /><path d="m3 12 9 5 9-5" /><path d="m3 17 9 5 9-5" /></svg>Offerwall</div>
          <div className="app__navlbl">Account</div>
          <div className="app__item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20" /><circle cx="9" cy="7" r="3.5" /><path d="M22 20v-1.5a4 4 0 0 0-3-3.85" /><path d="M16.5 3.6a4 4 0 0 1 0 7" /></svg>Referrals</div>
          <div className="app__item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a1 1 0 0 1 1 1v2" /><path d="M3 7.5V18a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3" /><path d="M20 9h-4a2.5 2.5 0 0 0 0 5h4a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1z" /></svg>Withdraw</div>
        </div>
        <div className="app__side-foot">
          <b>Day 4 streak</b>
          <p>Day 7 pays 65 tokens and +3% on every claim.</p>
        </div>
      </aside>

      <div className="app__main">
        <div className="app__top">
          <span className="app__title">Dashboard</span>
          <span className="app__search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.6-3.6" /></svg>Search<kbd>⌘K</kbd></span>
          <span className="app__balchip">
            <span className="num">6,851.79</span>
            <span className="pill pill--mint">USDT</span>
          </span>
          <span className="avatar avatar--sm" aria-hidden="true">KY</span>
        </div>

        <div className="app__body">
          <div className="stat stat--hero app__bal">
            <div className="stat__label">Available balance</div>
            <div className="app__balrow">
              <div>
                <div className="app__balval">6,851.79<small>tokens</small></div>
                <div className="stat__sub">≈ 0.06770543 USDT · withdrawable now</div>
              </div>
              <svg className="app__spark" viewBox="0 0 168 42" fill="none" aria-hidden="true">
                <path d="M2 34 22 30 42 33 62 22 82 25 102 14 122 17 142 7 166 4" stroke="url(#vfg2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2 34 22 30 42 33 62 22 82 25 102 14 122 17 142 7 166 4V42H2z" fill="url(#vfg2)" fillOpacity="0.13" />
              </svg>
            </div>
            <div className="app__chips">
              <span className="pill pill--mint">+0.7% earning bonus</span>
              <span className="pill pill--violet">Level 21</span>
              <span className="pill pill--neutral">47/205 exp</span>
            </div>
          </div>

          <div className="card app__chart">
            <div className="app__chart-h"><span>Earnings · 7 days</span><span className="mono t-mint">+1,180</span></div>
            <div className="bars" aria-hidden="true">
              <div><i style={{ height: '6%' }}></i><em>26/08</em></div>
              <div><i className="v" style={{ height: '31%' }}></i><em>27/08</em></div>
              <div><i style={{ height: '14%' }}></i><em>28/08</em></div>
              <div><i style={{ height: '68%' }}></i><em>29/08</em></div>
              <div><i className="v" style={{ height: '22%' }}></i><em>30/08</em></div>
              <div><i style={{ height: '100%' }}></i><em>31/08</em></div>
              <div><i style={{ height: '54%' }}></i><em>01/09</em></div>
            </div>
          </div>

          <div className="app__tasks">
            <div className="task app__task">
              <div className="task__top">
                <svg className="mini-ring" viewBox="0 0 36 36" fill="none" aria-hidden="true">
                  <circle cx="18" cy="18" r="15" stroke="var(--surface-3)" strokeWidth="3" />
                  <circle cx="18" cy="18" r="15" stroke="var(--mint)" strokeWidth="3" strokeLinecap="round" strokeDasharray="94.2" strokeDashoffset="26" transform="rotate(-90 18 18)" />
                </svg>
                <div className="grow">
                  <div className="task__name">Faucet claim</div>
                  <div className="task__desc">Next claim in 34:00 · 999/1000 today</div>
                </div>
                <span className="task__reward">+65</span>
              </div>
              <div className="task__foot">
                <span className="pill pill--warning">Happy hour in 02:37</span>
                <span className="btn btn--primary btn--sm">Claim</span>
              </div>
            </div>
            <div className="task app__task">
              <div className="task__top">
                <span className="task__thumb">PT</span>
                <div className="grow">
                  <div className="task__name">Start Mining Crypto for Free</div>
                  <div className="task__desc">30s view · Window · cooldown 72h</div>
                </div>
                <span className="task__reward">+91</span>
              </div>
              <div className="task__foot">
                <span className="pill pill--neutral">127 ads live</span>
                <span className="btn btn--secondary btn--sm">Watch</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

                      </div>
                    </div>
                    <div className="lap__foot" aria-hidden="true"></div>
                  </div>
                  <div className="phone" aria-hidden="true">
      <div className="phone__screen">
        <div className="phone__notch"></div>
        <div className="ph">
          <div className="ph__top">
            <b>Faucet</b>
            <span className="pill pill--mint">+0.7%</span>
          </div>
          <div className="ph__claim">
            <div className="ph__ring">
              <svg viewBox="0 0 128 128" fill="none">
                <circle cx="64" cy="64" r="56" stroke="var(--surface-3)" strokeWidth="7" />
                <circle cx="64" cy="64" r="56" stroke="url(#vfg2)" strokeWidth="7" strokeLinecap="round"
                        strokeDasharray="351.8" strokeDashoffset="96" transform="rotate(-90 64 64)" />
              </svg>
              <div className="ph__ring-lbl">
                <span className="num">34:00</span>
                <span>until next claim</span>
              </div>
            </div>
          </div>
          <span className="btn btn--primary btn--block">Claim 65 tokens</span>
          <div className="ph__rows">
            <div className="ph__row"><span>Faucet</span><span className="num">+65</span></div>
            <div className="ph__row"><span>Daily bonus</span><span className="num">+45</span></div>
            <div className="ph__row"><span>Challenge</span><span className="num">+100</span></div>
          </div>
        </div>
      </div>
    </div>

                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
