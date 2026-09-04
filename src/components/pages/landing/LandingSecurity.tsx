import { nf } from '@/lib/format';

/* ============================================================================
   LANDING SECURITY
   ----------------------------------------------------------------------------
   The trust grid: what happens to an account and what does not. Every claim here
   is checkable against the code — no KYC to earn, one account per person, claims
   validated server-side.

   Markup ported from the HTML prototype unchanged. Styling lives in
   `src/styles/landing.css`, scoped under `.vz-lp`.
   ========================================================================== */

export function LandingSecurity({ withdrawalsToday }: { withdrawalsToday: number }) {
  const settledLabel =
    withdrawalsToday > 0
      ? `${nf(withdrawalsToday)} withdrawals settled today`
      : 'Automated rails settle in under a minute';

  return (
    <section className="sec" id="security" aria-labelledby="secH">
      <div className="container">
        <div className="sec__head">
          <p className="sec__eyebrow">Security & trust</p>
          <h2 className="sec__title" id="secH">Built so a claim<br />cannot be faked.</h2>
          <p className="sec__lead">Faucets come and go. Here is specifically how this one is put together.</p>
        </div>

        <div className="sgrid" id="sgrid">
          <div className="glass scard">
            <div className="scard__h">
              <span className="scard__ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></svg></span>
              <h3 className="scard__t">Payouts are automated, not approved</h3>
            </div>
            <p className="scard__b">FaucetPay and CWallet withdrawals are processed by the system the moment you confirm — there is no manual review queue and no discretionary hold. Direct on-chain payouts are batched and settle within 48 hours, and the batch time is printed on your receipt so you know exactly when to expect it.</p>
            <p className="scard__f">{settledLabel}</p>
          </div>

          <div className="glass scard">
            <div className="scard__h">
              <span className="scard__ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a1 1 0 0 1 1 1v2" /><path d="M3 7.5V18a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3" /><path d="M20 9h-4a2.5 2.5 0 0 0 0 5h4a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1z" /></svg></span>
              <h3 className="scard__t">The lowest minimums in the category</h3>
            </div>
            <p className="scard__b">You do not need to grind for a month to see money. USDT clears at 0.010000 on FaucetPay, BTC at 0.00000500.</p>
            <p className="scard__f">0.010000 USDT minimum</p>
          </div>

          <div className="glass scard">
            <div className="scard__h">
              <span className="scard__ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 2.5 4.5 5.7v5.5c0 4.6 3.1 8.9 7.5 10.3 4.4-1.4 7.5-5.7 7.5-10.3V5.7z" /><path d="m9 12 2.2 2.2L15.5 10" /></svg></span>
              <h3 className="scard__t">Anti-fraud runs at claim time</h3>
            </div>
            <p className="scard__b">Bot, proxy and multi-account detection happens when a claim is made, not weeks later at withdrawal. Honest earners never have a balance frozen retroactively.</p>
            <p className="scard__f">One account per person, per network</p>
          </div>

          <div className="glass scard">
            <div className="scard__h">
              <span className="scard__ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><path d="M4 14h2a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM20 14h-2a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1z" /><path d="M20 19v.5a2.5 2.5 0 0 1-2.5 2.5H13" /></svg></span>
              <h3 className="scard__t">24/7 assistant, with a human behind it</h3>
            </div>
            <p className="scard__b">Vie Assistant answers balance, payout and offer-crediting questions instantly, and escalates a stuck conversion to a human in one click.</p>
            <p className="scard__f">Median first response: under 2 minutes</p>
          </div>

          <div className="glass scard">
            <div className="scard__h">
              <span className="scard__ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg></span>
              <h3 className="scard__t">Every credit has a ledger row</h3>
            </div>
            <p className="scard__b">
              A balance change and the row that explains it are written in one transaction, so
              your balance always equals the sum of your claims minus your withdrawals. Open
              Transactions and check it.
            </p>
            <p className="scard__f">Readable in Transactions, every row</p>
          </div>
        </div>
      </div>
    </section>
  );
}
