import { compact } from '@/lib/format';

/* ============================================================================
   LANDING EARN
   ----------------------------------------------------------------------------
   The earning-surface bento grid. Entirely static: every claim in it describes how
   the product works, not how much anyone has made.

   Markup ported from the HTML prototype unchanged. Styling lives in
   `src/styles/landing.css`, scoped under `.vz-lp`.
   ========================================================================== */

export function LandingEarn({ members }: { members: number }) {
  /* The prototype hardcoded a member count here. Zero members is a real state for
     a new deployment, and "+0" reads as broken, so the label falls back to naming
     the thing instead of counting it. */
  const membersLabel = members > 0 ? `+${compact(members)}` : 'Open to all';

  return (
    <section className="sec" id="earn" aria-labelledby="earnH">
      <div className="container">
        <div className="sec__head">
          <p className="sec__eyebrow">Eight ways to earn</p>
          <h2 className="sec__title" id="earnH">Pick a rail. They all pay<br />into the same balance.</h2>
          <p className="sec__lead">Every rate below is live inventory, not a marketing range. Nothing is gated behind a deposit and nothing expires.</p>
        </div>

        <div className="bento" id="bento">
          <article className="bento__c bento__c--faucet" data-bcard={true}>
            <span className="bento__glow" aria-hidden="true"></span>
            <span className="bico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 2.7 6.9 8.3a7 7 0 1 0 10.2 0z" /></svg></span>
            <h3 className="bento__t">Faucet</h3>
            <p className="bento__d">The baseline. One tap every 34 minutes, up to 1,000 claims a reset, and a happy hour that adds +10% on top.</p>
            <div className="bento__viz row gap-4">
              <div className="ring" style={{ width: '104px', height: '104px' }}>
                <svg width="104" height="104" viewBox="0 0 104 104" aria-hidden="true">
                  <circle className="ring__track" cx="52" cy="52" r="45" strokeWidth="8" />
                  <circle className="ring__fill" cx="52" cy="52" r="45" strokeWidth="8" stroke="url(#vfg2)" strokeDasharray="282.7" strokeDashoffset="78" />
                </svg>
                <span className="ring__label"><b className="num" style={{ fontSize: 'var(--t-16)' }}>34:00</b></span>
              </div>
              <div className="stack gap-2">
                <span className="pill pill--warning">Happy hour +10%</span>
                <span className="pill pill--mint">+3 exp per claim</span>
                <span className="pill pill--neutral">999 / 1000 today</span>
              </div>
            </div>
            <p className="bento__rate">65 tokens every 34 min <small>· up to 1,000 claims per reset</small></p>
          </article>

          <article className="bento__c bento__c--ptc" data-bcard={true}>
            <span className="bento__glow" aria-hidden="true"></span>
            <span className="bico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3 11 14-6v14L3 13z" /><path d="M3 11v2a2 2 0 0 0 2 2h1v-6H5a2 2 0 0 0-2 2z" /><path d="M7 15v3a2 2 0 0 0 4 0v-2" /></svg></span>
            <h3 className="bento__t">Paid to click</h3>
            <p className="bento__d">Watch an advertiser for 10–30 seconds and get paid. Window, iframe, external and YouTube formats.</p>
            <p className="bento__rate">127 ads live · 50–91 tokens <small>· 2,988 tokens on the board</small></p>
          </article>

          <article className="bento__c bento__c--short" data-bcard={true}>
            <span className="bento__glow" aria-hidden="true"></span>
            <span className="bico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.6l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.6l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></svg></span>
            <h3 className="bento__t">Shortlinks</h3>
            <p className="bento__d">The highest per-action rate on the site. Resets daily at 05:30 UTC.</p>
            <p className="bento__rate">up to 432 per link <small>· 272 live</small></p>
          </article>

          <article className="bento__c bento__c--offer" data-bcard={true}>
            <span className="bento__glow" aria-hidden="true"></span>
            <span className="bico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m12 2 9 5-9 5-9-5z" /><path d="m3 12 9 5 9-5" /><path d="m3 17 9 5 9-5" /></svg></span>
            <h3 className="bento__t">Offerwall</h3>
            <p className="bento__d">Nine providers — CPX, BitLabs, Timewall, Notik and more.</p>
            <p className="bento__rate">up to 14.7M per offer <small>· 9 providers</small></p>
          </article>

          <article className="bento__c bento__c--refer" data-bcard={true}>
            <span className="bento__glow" aria-hidden="true"></span>
            <span className="bico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20" /><circle cx="9" cy="7" r="3.5" /><path d="M22 20v-1.5a4 4 0 0 0-3-3.85" /><path d="M16.5 3.6a4 4 0 0 1 0 7" /></svg></span>
            <h3 className="bento__t">Referrals</h3>
            <p className="bento__d">A lifetime share of everything your friends earn — paid the moment they are. Four tiers, and the dashboard shows you exactly which channel your invites came from.</p>
            <div className="bento__viz">
              <div className="bento__avis">
                <span className="avatar" aria-hidden="true">RK</span><span className="avatar" aria-hidden="true">DP</span>
                <span className="avatar" aria-hidden="true">MA</span><span className="avatar" aria-hidden="true">CO</span>
                <span className="avatar" aria-hidden="true">JR</span>
                <span className="bento__more mono">{membersLabel}</span>
              </div>
              <div className="row gap-2 wrap" style={{ marginTop: 'var(--s-4)' }}>
                <span className="pill pill--neutral">Bronze 5%</span><span className="pill pill--mint">Silver 10%</span>
                <span className="pill pill--violet">Gold 12%</span><span className="pill pill--info">Elite 15%</span>
              </div>
            </div>
            <p className="bento__rate">10% lifetime <small>· at your current Silver tier</small></p>
          </article>

          <article className="bento__c bento__c--lot" data-bcard={true}>
            <span className="bento__glow" aria-hidden="true"></span>
            <span className="bico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2 2 2 0 0 0 0 6 2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 2 2 0 0 0 0-6z" /><path d="M13 7v2M13 13v2" /></svg></span>
            <h3 className="bento__t">Lottery</h3>
            <p className="bento__d">4,000 tickets drawn every Sunday 00:00 UTC.</p>
            <p className="bento__rate">4,000,000 token pool <small>· weekly</small></p>
          </article>

          <article className="bento__c bento__c--daily" data-bcard={true}>
            <span className="bento__glow" aria-hidden="true"></span>
            <span className="bico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 12v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8" /><path d="M2 8h20v4H2z" /><path d="M12 21V8" /><path d="M12 8H7.5a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8z" /><path d="M12 8h4.5a2.5 2.5 0 0 0 0-5C13 3 12 8 12 8z" /></svg></span>
            <h3 className="bento__t">Daily bonus</h3>
            <p className="bento__d">An eight-day ladder. Day 7 pays 65 tokens and the top bonus.</p>
            <p className="bento__rate">up to +3% earning bonus <small>· compounds on every rail</small></p>
          </article>

          <article className="bento__c bento__c--chal" data-bcard={true}>
            <span className="bento__glow" aria-hidden="true"></span>
            <span className="bico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" /></svg></span>
            <h3 className="bento__t">Challenges</h3>
            <p className="bento__d">Eleven standing quests that pay on top of whatever the underlying rail already paid you.</p>
            <p className="bento__rate">up to 5,000 tokens <small>· 11 live quests</small></p>
          </article>
        </div>
      </div>
    </section>
  );
}
