/* ============================================================================
   LANDING HOW
   ----------------------------------------------------------------------------
   The four-step explainer, and the one pinned scroll section on the page.
   `LandingRuntime` crossfades the four panels against a pinned viewport. Without
   JavaScript, CSS un-stacks them so all four read in document flow.

   Markup ported from the HTML prototype unchanged. Styling lives in
   `src/styles/landing.css`, scoped under `.vz-lp`.
   ========================================================================== */

export function LandingHow() {
  return (
    <section className="how" id="how" aria-labelledby="howH">
      <div className="how__vp" id="howPin">
        <div className="container how__grid">
          <div>
            <p className="sec__eyebrow">How it works</p>
            <h2 className="sec__title" id="howH">Four steps between<br />signing up and getting paid.</h2>

            <div className="how__steps u-mt-8">
              <div className="how__rail" aria-hidden="true"><div className="how__rail-fill" id="howRail"></div></div>

              <div className="how__step is-on" data-step="0">
                <div className="how__step-top"><span className="how__num">01</span><span className="how__step-t">Sign up</span></div>
                <p className="how__step-b">Email or Google. Ten seconds, no KYC, no deposit, no minimum balance. You can claim your first faucet before the welcome email lands.</p>
              </div>
              <div className="how__step" data-step="1">
                <div className="how__step-top"><span className="how__num">02</span><span className="how__step-t">Earn</span></div>
                <p className="how__step-b">Four earning rails, always live: the 34-minute faucet, 127 PTC ads, 272 shortlinks and nine offerwall providers paying up to 14.7M tokens per offer.</p>
              </div>
              <div className="how__step" data-step="2">
                <div className="how__step-top"><span className="how__num">03</span><span className="how__step-t">Watch it stack</span></div>
                <p className="how__step-b">Daily streaks add up to +3% on every claim. Challenges pay up to 5,000 tokens. Referrals pay you 10% of what your friends earn, for life.</p>
              </div>
              <div className="how__step" data-step="3">
                <div className="how__step-top"><span className="how__num">04</span><span className="how__step-t">Cash out</span></div>
                <p className="how__step-b">Twelve assets across three rails. Every minimum, fee and arrival time is shown before you confirm — never after.</p>
              </div>
            </div>
          </div>

          <div className="how__stage" id="howStage">
            <div className="how__glowring" aria-hidden="true"></div>

            {/* Panel 1 — sign up */}
            <div className="how__panel" data-panel="0">
              <div className="card card--pad-lg how__card">
                <p className="eyebrow">Create your account</p>
                <div className="stack gap-3 u-mt-6">
                  <div className="field"><span className="label">Email</span>
                    <div className="input" style={{ display: 'flex', alignItems: 'center', color: 'var(--text)' }}>you@example.com<span style={{ width: '1px', height: '16px', background: 'var(--mint)', marginLeft: '2px' }}></span></div>
                  </div>
                  <div className="field"><span className="label">Username</span>
                    <div className="input" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-3)' }}>pick anything</div>
                  </div>
                  <span className="btn btn--primary btn--lg btn--block">Create account</span>
                  <span className="btn btn--secondary btn--block">Continue with Google</span>
                </div>
                <div className="row gap-2 wrap" style={{ marginTop: 'var(--s-5)' }}>
                  <span className="pill pill--success"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="m4.5 12.5 5 5 10-11" /></svg>No KYC</span>
                  <span className="pill pill--success"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="m4.5 12.5 5 5 10-11" /></svg>No deposit</span>
                  <span className="pill pill--mint">~10 seconds</span>
                </div>
              </div>
            </div>

            {/* Panel 2 — earn */}
            <div className="how__panel" data-panel="1">
              <div className="how__card stack gap-3">
                <div className="task">
                  <div className="task__top">
                    <svg className="mini-ring" viewBox="0 0 36 36" fill="none" aria-hidden="true">
                      <circle cx="18" cy="18" r="15" stroke="var(--surface-3)" strokeWidth="3" />
                      <circle cx="18" cy="18" r="15" stroke="var(--mint)" strokeWidth="3" strokeLinecap="round" strokeDasharray="94.2" strokeDashoffset="30" transform="rotate(-90 18 18)" />
                    </svg>
                    <div className="grow"><div className="task__name">Faucet</div><div className="task__desc">Every 34 minutes · 999/1000 today</div></div>
                    <span className="task__reward">+65</span>
                  </div>
                </div>
                <div className="task">
                  <div className="task__top">
                    <span className="task__thumb">OW</span>
                    <div className="grow"><div className="task__name">Offerwall · CPX Research</div><div className="task__desc">9 providers · 4.9★ · avg 6 minutes</div></div>
                    <span className="task__reward">+24,444</span>
                  </div>
                </div>
                <div className="task">
                  <div className="task__top">
                    <span className="task__thumb">AD</span>
                    <div className="grow"><div className="task__name">PTC · Start Mining Crypto</div><div className="task__desc">30s view · 127 ads live right now</div></div>
                    <span className="task__reward">+91</span>
                  </div>
                </div>
                <div className="task">
                  <div className="task__top">
                    <span className="task__thumb">SL</span>
                    <div className="grow"><div className="task__name">Shortlink · amritlink</div><div className="task__desc">190s · 272 links available</div></div>
                    <span className="task__reward">+432</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Panel 3 — stack */}
            <div className="how__panel" data-panel="2">
              <div className="card card--pad-lg how__card">
                <div className="between">
                  <div>
                    <p className="eyebrow">Level 21</p>
                    <p className="t-2" style={{ fontSize: 'var(--t-13)', marginTop: '6px' }}>47 / 205 exp to level 22</p>
                  </div>
                  <div className="ring" style={{ width: '96px', height: '96px' }}>
                    <svg width="96" height="96" viewBox="0 0 96 96">
                      <circle className="ring__track" cx="48" cy="48" r="42" strokeWidth="7" />
                      <circle className="ring__fill" cx="48" cy="48" r="42" strokeWidth="7" stroke="url(#vfg)" strokeDasharray="263.9" strokeDashoffset="80" />
                    </svg>
                    <span className="ring__label"><b className="num" style={{ fontSize: 'var(--t-20)' }}>21</b></span>
                  </div>
                </div>
                <div className="hr" style={{ marginBlock: 'var(--s-5)' }}></div>
                <div className="stack gap-3">
                  <div className="between"><span className="t-2" style={{ fontSize: 'var(--t-13)' }}>Day 4 streak</span><span className="pill pill--warning">+1.5% bonus</span></div>
                  <div className="bar"><div className="bar__fill bar__fill--grad" style={{ width: '57%' }}></div></div>
                  <div className="between"><span className="t-2" style={{ fontSize: 'var(--t-13)' }}>Challenge · 50 faucet claims</span><span className="mono t-mint" style={{ fontSize: 'var(--t-13)' }}>+150</span></div>
                  <div className="bar"><div className="bar__fill" style={{ width: '34%' }}></div></div>
                  <div className="between"><span className="t-2" style={{ fontSize: 'var(--t-13)' }}>Referral commission · Silver</span><span className="mono t-mint" style={{ fontSize: 'var(--t-13)' }}>10% lifetime</span></div>
                  <div className="bar"><div className="bar__fill" style={{ width: '45%' }}></div></div>
                </div>
              </div>
            </div>

            {/* Panel 4 — cash out */}
            <div className="how__panel" data-panel="3">
              <div className="card how__card">
                <div className="card__head">
                  <span className="card__title">Withdrawal receipt</span>
                  <span className="pill pill--success"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="m4.5 12.5 5 5 10-11" /></svg>Completed</span>
                </div>
                <div className="card__body stack gap-3">
                  <div className="between"><span className="t-3" style={{ fontSize: 'var(--t-12)' }}>Asset</span><span className="row gap-2"><span className="coin" data-c="USDT">₮</span><span className="mono" style={{ fontSize: 'var(--t-13)' }}>USDT</span></span></div>
                  <div className="between"><span className="t-3" style={{ fontSize: 'var(--t-12)' }}>Rail</span><span className="mono" style={{ fontSize: 'var(--t-13)' }}>FaucetPay · TRC-20</span></div>
                  <div className="between"><span className="t-3" style={{ fontSize: 'var(--t-12)' }}>Amount</span><span className="mono" style={{ fontSize: 'var(--t-13)' }}>2.480000</span></div>
                  <div className="between"><span className="t-3" style={{ fontSize: 'var(--t-12)' }}>Network fee</span><span className="mono" style={{ fontSize: 'var(--t-13)' }}>0.000100</span></div>
                  <div className="hr"></div>
                  <div className="between"><span style={{ fontSize: 'var(--t-13)', fontWeight: '600' }}>You receive</span><span className="mono t-mint" style={{ fontSize: 'var(--t-20)', fontWeight: '600' }}>2.479900</span></div>
                  <div className="between"><span className="t-3" style={{ fontSize: 'var(--t-12)' }}>Settled in</span><span className="mono t-up" style={{ fontSize: 'var(--t-13)' }}>41 seconds</span></div>
                </div>
                <div className="card__foot t-3" style={{ fontSize: 'var(--t-11)' }}>
                  <span className="mono">0x7f3a9c21e8b45d0a6c1f</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
