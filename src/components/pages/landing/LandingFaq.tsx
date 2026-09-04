/* ============================================================================
   LANDING FAQ
   ----------------------------------------------------------------------------
   The FAQ accordion. `LandingRuntime` animates the panels; the markup ships with
   every answer present and `aria-expanded` correct, so with JavaScript off it
   degrades to a plain list of questions and answers rather than to nothing.

   Markup ported from the HTML prototype unchanged. Styling lives in
   `src/styles/landing.css`, scoped under `.vz-lp`.
   ========================================================================== */

export function LandingFaq() {
  return (
    <section className="sec" id="faq" aria-labelledby="faqH">
      <div className="container">
        <div className="sec__head sec__head--center">
          <p className="sec__eyebrow" style={{ justifyContent: 'center' }}>FAQ</p>
          <h2 className="sec__title" id="faqH">The questions that actually get asked.</h2>
        </div>
        <div className="faq" id="faqList">
          <div className="faq__i">
            <h3>
              <button className="faq__q" type="button" id="faq-b0" aria-expanded="false" aria-controls="faq-p0">
                How fast are withdrawals?
                <span className="faq__ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" focusable="false"><path d="m5 9 7 7 7-7" /></svg></span>
              </button>
            </h3>
            <div className="faq__a" id="faq-p0" role="region" aria-labelledby="faq-b0">
              <div className="faq__a-in">FaucetPay and CWallet payouts are automated and typically land in under 60 seconds. Direct on-chain withdrawals are batched and settle within 48 hours, with the exact batch time shown on your withdrawal receipt.</div>
            </div>
          </div>
          <div className="faq__i">
            <h3>
              <button className="faq__q" type="button" id="faq-b1" aria-expanded="false" aria-controls="faq-p1">
                What is the minimum withdrawal?
                <span className="faq__ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" focusable="false"><path d="m5 9 7 7 7-7" /></svg></span>
              </button>
            </h3>
            <div className="faq__a" id="faq-p1" role="region" aria-labelledby="faq-b1">
              <div className="faq__a-in">It depends on the asset and rail — from 0.00000500 BTC or 0.010000 USDT on FaucetPay. Every minimum, network fee and estimated arrival time is shown before you confirm, never after.</div>
            </div>
          </div>
          <div className="faq__i">
            <h3>
              <button className="faq__q" type="button" id="faq-b2" aria-expanded="false" aria-controls="faq-p2">
                How much do referrals pay?
                <span className="faq__ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" focusable="false"><path d="m5 9 7 7 7-7" /></svg></span>
              </button>
            </h3>
            <div className="faq__a" id="faq-p2" role="region" aria-labelledby="faq-b2">
              <div className="faq__a-in">You earn a lifetime share of everything your referrals earn — 5% at Bronze, 10% at Silver, 12% at Gold and 15% at Elite. Referrals count once they reach level 1. Your tier and progress are on the Referrals page.</div>
            </div>
          </div>
          <div className="faq__i">
            <h3>
              <button className="faq__q" type="button" id="faq-b3" aria-expanded="false" aria-controls="faq-p3">
                Can I create multiple accounts?
                <span className="faq__ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" focusable="false"><path d="m5 9 7 7 7-7" /></svg></span>
              </button>
            </h3>
            <div className="faq__a" id="faq-p3" role="region" aria-labelledby="faq-b3">
              <div className="faq__a-in">No. One account per person and per network. Multi-accounting is the fastest way to lose a balance, and our anti-fraud system flags it automatically.</div>
            </div>
          </div>
          <div className="faq__i">
            <h3>
              <button className="faq__q" type="button" id="faq-b4" aria-expanded="false" aria-controls="faq-p4">
                Can I use a bot, VPN or proxy?
                <span className="faq__ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" focusable="false"><path d="m5 9 7 7 7-7" /></svg></span>
              </button>
            </h3>
            <div className="faq__a" id="faq-p4" role="region" aria-labelledby="faq-b4">
              <div className="faq__a-in">No. Automation, VPNs and proxies are not permitted and are detected at claim time. If you travel and need to sign in from a new region, open a ticket first and support will whitelist the session.</div>
            </div>
          </div>
          <div className="faq__i">
            <h3>
              <button className="faq__q" type="button" id="faq-b5" aria-expanded="false" aria-controls="faq-p5">
                Why has my offer not credited yet?
                <span className="faq__ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" focusable="false"><path d="m5 9 7 7 7-7" /></svg></span>
              </button>
            </h3>
            <div className="faq__a" id="faq-p5" role="region" aria-labelledby="faq-b5">
              <div className="faq__a-in">Offerwall providers send their postback after the advertiser verifies the action — usually minutes, occasionally up to 12 hours. Pending conversions are visible in Offerwall → History with a live status. If one is older than 12 hours, Vie Assistant can escalate it to a human in one click.</div>
            </div>
          </div></div>
      </div>
    </section>
  );
}
