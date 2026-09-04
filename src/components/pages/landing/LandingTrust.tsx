/* ============================================================================
   LANDING TRUST
   ----------------------------------------------------------------------------
   The payout-rail and asset marquee. `LandingRuntime` clones the track and tweens
   it; with JavaScript absent the row is a static, readable list rather than an
   empty strip — the contract this page keeps with itself throughout.

   Markup ported from the HTML prototype unchanged. Styling lives in
   `src/styles/landing.css`, scoped under `.vz-lp`.
   ========================================================================== */

export function LandingTrust() {
  return (
    <section className="trust" id="payouts-marquee" aria-labelledby="trustH">
      <div className="container trust__in">
        <div className="trust__head">
          <p className="eyebrow" id="trustH">Payout partners & supported assets</p>
          <button className="mq-btn" id="mqToggle" type="button" aria-pressed="false" aria-label="Pause the scrolling asset list">
            <span className="mq-btn__pause">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            </span>
            <span className="mq-btn__play">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M7 4.5 19 12 7 19.5z" /></svg>
            </span>
            <span id="mqLabel">Pause</span>
          </button>
        </div>
        <div className="marquee" id="marquee">
          <div className="marquee__track" id="mqTrack">
            <div className="marquee__set">
              <div className="mq-item mq-rail">
                <span className="mq-rail__mark mq-rail__mark--fp"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></svg></span>
                <span><span className="mq-item__t">FaucetPay</span><br /><span className="mq-item__s">Automated · under 60s</span></span>
              </div>
              <div className="mq-item mq-rail">
                <span className="mq-rail__mark mq-rail__mark--cw"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a1 1 0 0 1 1 1v2" /><path d="M3 7.5V18a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3" /><path d="M20 9h-4a2.5 2.5 0 0 0 0 5h4a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1z" /></svg></span>
                <span><span className="mq-item__t">CWallet</span><br /><span className="mq-item__s">Automated · ~5 minutes</span></span>
              </div>
              <div className="mq-item mq-rail">
                <span className="mq-rail__mark mq-rail__mark--dw"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21.5 2.5 10.5 13.5" /><path d="M21.5 2.5 15 21l-4.5-7.5L3 9z" /></svg></span>
                <span><span className="mq-item__t">Direct on-chain</span><br /><span className="mq-item__s">Your own wallet · ≤48h</span></span>
              </div>
          
              <div className="mq-item">
                <span className="coin coin--lg" data-c="BTC" aria-hidden="true">BTC</span>
                <span><span className="mq-item__t">BTC</span><br /><span className="mq-item__s">Bitcoin · FaucetPay</span></span>
              </div>
              <div className="mq-item">
                <span className="coin coin--lg" data-c="LTC" aria-hidden="true">Ł</span>
                <span><span className="mq-item__t">LTC</span><br /><span className="mq-item__s">Litecoin · FaucetPay</span></span>
              </div>
              <div className="mq-item">
                <span className="coin coin--lg" data-c="TRX" aria-hidden="true">▲</span>
                <span><span className="mq-item__t">TRX</span><br /><span className="mq-item__s">TRON · FaucetPay</span></span>
              </div>
              <div className="mq-item">
                <span className="coin coin--lg" data-c="SOL" aria-hidden="true">◎</span>
                <span><span className="mq-item__t">SOL</span><br /><span className="mq-item__s">Solana · FaucetPay</span></span>
              </div>
              <div className="mq-item">
                <span className="coin coin--lg" data-c="DOGE" aria-hidden="true">Ð</span>
                <span><span className="mq-item__t">DOGE</span><br /><span className="mq-item__s">Dogecoin · Direct on-chain</span></span>
              </div>
              <div className="mq-item">
                <span className="coin coin--lg" data-c="USDT" aria-hidden="true">₮</span>
                <span><span className="mq-item__t">USDT</span><br /><span className="mq-item__s">Tether · FaucetPay</span></span>
              </div>
              <div className="mq-item">
                <span className="coin coin--lg" data-c="TON" aria-hidden="true">◈</span>
                <span><span className="mq-item__t">TON</span><br /><span className="mq-item__s">Toncoin · FaucetPay</span></span>
              </div>
              <div className="mq-item">
                <span className="coin coin--lg" data-c="PEPE" aria-hidden="true">PEP</span>
                <span><span className="mq-item__t">PEPE</span><br /><span className="mq-item__s">Pepe · FaucetPay · CWallet</span></span>
              </div>
              <div className="mq-item">
                <span className="coin coin--lg" data-c="SHIB" aria-hidden="true">SHB</span>
                <span><span className="mq-item__t">SHIB</span><br /><span className="mq-item__s">Shiba Inu · CWallet</span></span>
              </div>
              <div className="mq-item">
                <span className="coin coin--lg" data-c="FLOKI" aria-hidden="true">FLO</span>
                <span><span className="mq-item__t">FLOKI</span><br /><span className="mq-item__s">Floki · CWallet</span></span>
              </div>
              <div className="mq-item">
                <span className="coin coin--lg" data-c="BONK" aria-hidden="true">BNK</span>
                <span><span className="mq-item__t">BONK</span><br /><span className="mq-item__s">Bonk · CWallet</span></span>
              </div>
              <div className="mq-item">
                <span className="coin coin--lg" data-c="BNB" aria-hidden="true">◆</span>
                <span><span className="mq-item__t">BNB</span><br /><span className="mq-item__s">BNB · Direct on-chain</span></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
