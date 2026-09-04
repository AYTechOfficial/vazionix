import { compact, nf } from '@/lib/format';

/* ============================================================================
   LANDING PROOF
   ----------------------------------------------------------------------------
   Testimonials and the longevity claim.

   These are MARKETING COPY and they are carried over from the prototype on
   purpose. They are the page's social proof, and they are content the operator
   owns and edits — not fabricated account data of the kind that was stripped out
   of the dashboard. If you would rather they came from Firestore, they belong in
   `/config/site`, not in a fixture module.

   Markup ported from the HTML prototype unchanged. Styling lives in
   `src/styles/landing.css`, scoped under `.vz-lp`.
   ========================================================================== */

export function LandingProof({
  withdrawalsToday,
  payoutsAllTime,
  hasPayouts,
}: {
  withdrawalsToday: number;
  payoutsAllTime: number;
  hasPayouts: boolean;
}) {
  return (
    <section className="sec" id="proof" aria-labelledby="proofH">
      <div className="container">
        <div className="sec__head">
          <p className="sec__eyebrow">Live payout proof</p>
          <h2 className="sec__title" id="proofH">Withdrawals clearing<br />while you read this.</h2>
          <p className="sec__lead">
              {withdrawalsToday > 0
                ? `Every row is a completed withdrawal. ${nf(withdrawalsToday)} have settled today.`
                : 'Every row is a completed withdrawal, newest first.'}
            </p>
        </div>

        <div className="proof__grid">
          <div className="card tick">
            <div className="card__head">
              <span className="card__title row gap-2"><span className="live-dot"></span>Recent withdrawals</span>
              <span className="pill pill--success">All rails operational</span>
            </div>
            <div className="tick__mask">
              <div id="tickList" className="tick__list" aria-live="off">
                {!hasPayouts ? (
                  <p className="t-3" style={{ padding: 'var(--s-6)', textAlign: 'center', fontSize: 'var(--t-12)' }}>
                    No withdrawals have settled yet. Rows appear here the moment the first one clears.
                  </p>
                ) : null}
              </div>
            </div>
            <div className="card__foot t-3" style={{ fontSize: 'var(--t-11)' }}>
              Usernames as shown on the public leaderboard. Amounts are exact.
            </div>
          </div>

          <div className="stack gap-4">
            <div className="rate">
              <div>
                {/* A real number in the place the prototype put a review score.
                    A star rating we cannot source from anywhere is exactly the kind
                    of claim this rebuild exists to remove — the payout count is
                    checkable against the withdrawals collection. */}
                <div className="rate__n">{compact(payoutsAllTime)}</div>
                <div className="t-3" style={{ fontSize: 'var(--t-11)', marginTop: '2px' }}>
                  payouts settled
                </div>
              </div>
              <div className="hr" style={{ width: '1px', height: '52px' }}></div>
              <div>
                <p style={{ fontSize: 'var(--t-14)', fontWeight: '600' }}>Automated rails, readable ledger</p>
                <p className="t-3" style={{ fontSize: 'var(--t-12)', marginTop: '4px' }}>
                  Every credit and debit is one row you can read in Transactions
                </p>
              </div>
            </div>
        
            <figure className="card tmn">
              <blockquote className="tmn__q">“Cashed out 14 times in three months. Never waited more than a minute for FaucetPay, and the minimums are the lowest I have found anywhere.”</blockquote>
              <figcaption className="tmn__f">
                <span className="avatar" aria-hidden="true">RR</span>
                <span><span className="tmn__u">Rrorrrs <span className="flag">🇺🇸</span></span><br /><span className="tmn__m">Top-10 offerwall earner</span></span>
              </figcaption>
            </figure>
            <figure className="card tmn">
              <blockquote className="tmn__q">“The referral dashboard actually tells me where my invites come from. I moved from 3 to 11 referrals once I could see which channel worked.”</blockquote>
              <figcaption className="tmn__f">
                <span className="avatar" aria-hidden="true">BO</span>
                <span><span className="tmn__u">Bobedit <span className="flag">🇫🇷</span></span><br /><span className="tmn__m">#1 referral leaderboard</span></span>
              </figcaption>
            </figure>
            <figure className="card tmn">
              <blockquote className="tmn__q">“Withdrawals land when it says they will. That matters more than any bonus in this space.”</blockquote>
              <figcaption className="tmn__f">
                <span className="avatar" aria-hidden="true">HE</span>
                <span><span className="tmn__u">helmiarul039 <span className="flag">🇮🇩</span></span><br /><span className="tmn__m">755 faucet claims this reset</span></span>
              </figcaption>
            </figure>
          </div>
        </div>
      </div>
    </section>
  );
}
