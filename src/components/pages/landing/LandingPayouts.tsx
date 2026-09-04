/* ============================================================================
   LANDING PAYOUTS
   ----------------------------------------------------------------------------
   The payout orbit and the three rail cards. Assets and rails mirror the shipped
   `/config/rates` defaults; the withdraw page reads the same document, so the two
   cannot disagree about what is supported.

   Markup ported from the HTML prototype unchanged. Styling lives in
   `src/styles/landing.css`, scoped under `.vz-lp`.
   ========================================================================== */

export function LandingPayouts() {
  return (
    <section className="sec" id="payouts" aria-labelledby="payH">
      <div className="container">
        <div className="sec__head sec__head--center">
          <p className="sec__eyebrow" style={{ justifyContent: 'center' }}>Twelve assets, three rails</p>
          <h2 className="sec__title" id="payH">Take it out in whatever<br />you actually hold.</h2>
          <p className="sec__lead">Majors, stablecoins and memecoins. Same balance, your choice at the withdrawal step.</p>
        </div>

        <div className="orbit" id="orbit">
          <span className="orbit__halo" aria-hidden="true"></span>
          <span className="orbit__ring" aria-hidden="true"></span>
          <span className="orbit__ring orbit__ring--2" aria-hidden="true"></span>
          <div className="orbit__core">
            <div>
              <span className="num">12</span>
              <span>assets · 3 rails</span>
            </div>
          </div>
      
          <div className="orb" tabIndex={0} style={{ transform: 'translate(0px,-160px)' }}>
            <span className="orb__in" style={{ animationDuration: '7.4s', animationDelay: '-0.00s' }}>
              <span className="coin coin--lg" data-c="BTC" aria-hidden="true">BTC</span>
              <span className="orb__lbl"><b>BTC</b> Bitcoin</span>
            </span>
            <span className="sr-only">BTC — Bitcoin, withdrawable via FaucetPay</span>
          </div>
          <div className="orb" tabIndex={0} style={{ transform: 'translate(185px,-100px)' }}>
            <span className="orb__in" style={{ animationDuration: '10.0s', animationDelay: '-0.73s' }}>
              <span className="coin coin--lg" data-c="LTC" aria-hidden="true">Ł</span>
              <span className="orb__lbl"><b>LTC</b> Litecoin</span>
            </span>
            <span className="sr-only">LTC — Litecoin, withdrawable via FaucetPay</span>
          </div>
          <div className="orb" tabIndex={0} style={{ transform: 'translate(230px,36px)' }}>
            <span className="orb__in" style={{ animationDuration: '12.6s', animationDelay: '-1.46s' }}>
              <span className="coin coin--lg" data-c="TRX" aria-hidden="true">▲</span>
              <span className="orb__lbl"><b>TRX</b> TRON</span>
            </span>
            <span className="sr-only">TRX — TRON, withdrawable via FaucetPay</span>
          </div>
          <div className="orb" tabIndex={0} style={{ transform: 'translate(102px,144px)' }}>
            <span className="orb__in" style={{ animationDuration: '12.5s', animationDelay: '-2.19s' }}>
              <span className="coin coin--lg" data-c="SOL" aria-hidden="true">◎</span>
              <span className="orb__lbl"><b>SOL</b> Solana</span>
            </span>
            <span className="sr-only">SOL — Solana, withdrawable via FaucetPay</span>
          </div>
          <div className="orb" tabIndex={0} style={{ transform: 'translate(-102px,144px)' }}>
            <span className="orb__in" style={{ animationDuration: '15.1s', animationDelay: '-2.92s' }}>
              <span className="coin coin--lg" data-c="DOGE" aria-hidden="true">Ð</span>
              <span className="orb__lbl"><b>DOGE</b> Dogecoin</span>
            </span>
            <span className="sr-only">DOGE — Dogecoin, withdrawable via Direct on-chain</span>
          </div>
          <div className="orb" tabIndex={0} style={{ transform: 'translate(-230px,36px)' }}>
            <span className="orb__in" style={{ animationDuration: '9.2s', animationDelay: '-3.65s' }}>
              <span className="coin coin--lg" data-c="USDT" aria-hidden="true">₮</span>
              <span className="orb__lbl"><b>USDT</b> Tether</span>
            </span>
            <span className="sr-only">USDT — Tether, withdrawable via FaucetPay</span>
          </div>
          <div className="orb" tabIndex={0} style={{ transform: 'translate(-185px,-100px)' }}>
            <span className="orb__in" style={{ animationDuration: '9.1s', animationDelay: '-4.38s' }}>
              <span className="coin coin--lg" data-c="TON" aria-hidden="true">◈</span>
              <span className="orb__lbl"><b>TON</b> Toncoin</span>
            </span>
            <span className="sr-only">TON — Toncoin, withdrawable via FaucetPay</span>
          </div>
          <div className="orb" tabIndex={0} style={{ transform: 'translate(77px,-75px)' }}>
            <span className="orb__in" style={{ animationDuration: '11.7s', animationDelay: '-5.11s' }}>
              <span className="coin coin--lg" data-c="PEPE" aria-hidden="true">PEP</span>
              <span className="orb__lbl"><b>PEPE</b> Pepe</span>
            </span>
            <span className="sr-only">PEPE — Pepe, withdrawable via FaucetPay · CWallet</span>
          </div>
          <div className="orb" tabIndex={0} style={{ transform: 'translate(126px,28px)' }}>
            <span className="orb__in" style={{ animationDuration: '14.3s', animationDelay: '-5.84s' }}>
              <span className="coin coin--lg" data-c="SHIB" aria-hidden="true">SHB</span>
              <span className="orb__lbl"><b>SHIB</b> Shiba Inu</span>
            </span>
            <span className="sr-only">SHIB — Shiba Inu, withdrawable via CWallet</span>
          </div>
          <div className="orb" tabIndex={0} style={{ transform: 'translate(1px,92px)' }}>
            <span className="orb__in" style={{ animationDuration: '14.2s', animationDelay: '-6.57s' }}>
              <span className="coin coin--lg" data-c="FLOKI" aria-hidden="true">FLO</span>
              <span className="orb__lbl"><b>FLOKI</b> Floki</span>
            </span>
            <span className="sr-only">FLOKI — Floki, withdrawable via CWallet</span>
          </div>
          <div className="orb" tabIndex={0} style={{ transform: 'translate(-125px,29px)' }}>
            <span className="orb__in" style={{ animationDuration: '8.3s', animationDelay: '-7.30s' }}>
              <span className="coin coin--lg" data-c="BONK" aria-hidden="true">BNK</span>
              <span className="orb__lbl"><b>BONK</b> Bonk</span>
            </span>
            <span className="sr-only">BONK — Bonk, withdrawable via CWallet</span>
          </div>
          <div className="orb" tabIndex={0} style={{ transform: 'translate(-78px,-74px)' }}>
            <span className="orb__in" style={{ animationDuration: '10.9s', animationDelay: '-8.03s' }}>
              <span className="coin coin--lg" data-c="BNB" aria-hidden="true">◆</span>
              <span className="orb__lbl"><b>BNB</b> BNB</span>
            </span>
            <span className="sr-only">BNB — BNB, withdrawable via Direct on-chain</span>
          </div>
        </div>

        <div className="rails">
          <div className="card rail-c">
            <div className="rail-c__h">
              <span className="mq-rail__mark mq-rail__mark--fp"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></svg></span>
              <div><div className="rail-c__t">FaucetPay</div><div className="t-3" style={{ fontSize: 'var(--t-11)' }}>8 assets · automated</div></div>
            </div>
            <div className="rail-c__list">
              <div className="rail-c__row"><span className="coin" data-c="USDT">₮</span>USDT<span className="num">0.010000</span></div>
              <div className="rail-c__row"><span className="coin" data-c="BTC">₿</span>BTC<span className="num">0.00000500</span></div>
              <div className="rail-c__row"><span className="coin" data-c="LTC">Ł</span>LTC<span className="num">0.00010000</span></div>
              <div className="rail-c__row"><span className="coin" data-c="TRX">▲</span>TRX<span className="num">1.000000</span></div>
            </div>
            <p className="rail-c__eta">Lowest minimum on the site. Typically lands in under 60 seconds.</p>
          </div>

          <div className="card rail-c">
            <div className="rail-c__h">
              <span className="mq-rail__mark mq-rail__mark--cw"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a1 1 0 0 1 1 1v2" /><path d="M3 7.5V18a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3" /><path d="M20 9h-4a2.5 2.5 0 0 0 0 5h4a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1z" /></svg></span>
              <div><div className="rail-c__t">CWallet</div><div className="t-3" style={{ fontSize: 'var(--t-11)' }}>4 assets · automated</div></div>
            </div>
            <div className="rail-c__list">
              <div className="rail-c__row"><span className="coin" data-c="SHIB">SHB</span>SHIB<span className="num">10,000</span></div>
              <div className="rail-c__row"><span className="coin" data-c="FLOKI">FLO</span>FLOKI<span className="num">5,000</span></div>
              <div className="rail-c__row"><span className="coin" data-c="BONK">BNK</span>BONK<span className="num">50,000</span></div>
              <div className="rail-c__row"><span className="coin" data-c="PEPE">PEP</span>PEPE<span className="num">100,000</span></div>
            </div>
            <p className="rail-c__eta">Memecoin rail on BNB Chain and Solana. Around five minutes.</p>
          </div>

          <div className="card rail-c">
            <div className="rail-c__h">
              <span className="mq-rail__mark mq-rail__mark--dw"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21.5 2.5 10.5 13.5" /><path d="M21.5 2.5 15 21l-4.5-7.5L3 9z" /></svg></span>
              <div><div className="rail-c__t">Direct on-chain</div><div className="t-3" style={{ fontSize: 'var(--t-11)' }}>3 assets · your wallet</div></div>
            </div>
            <div className="rail-c__list">
              <div className="rail-c__row"><span className="coin" data-c="DOGE">Ð</span>DOGE<span className="num">2.000000</span></div>
              <div className="rail-c__row"><span className="coin" data-c="LTC">Ł</span>LTC<span className="num">0.00050000</span></div>
              <div className="rail-c__row"><span className="coin" data-c="BNB">◆</span>BNB<span className="num">0.00100000</span></div>
            </div>
            <p className="rail-c__eta">No intermediary. Batched and settled within 48 hours, batch time on the receipt.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
