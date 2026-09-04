import Link from 'next/link';
import { compact } from '@/lib/format';

/* ============================================================================
   LANDING CTA
   ----------------------------------------------------------------------------
   The closing call to action.

   Markup ported from the HTML prototype unchanged. Styling lives in
   `src/styles/landing.css`, scoped under `.vz-lp`.
   ========================================================================== */

export function LandingCta({ members, paidOutUsd }: { members: number; paidOutUsd: number }) {
  /* The prototype closed on three fixed figures. These are the same shape, read
     from the stats counters — and when the counters are still zero the line says
     what the product is instead of quoting nothing. */
  const meta =
    members > 0
      ? `${compact(members)} members · ${compact(paidOutUsd)} USD paid out · instant rails`
      : 'No deposit, no KYC to earn · instant payouts via FaucetPay and CWallet';

  return (
    <section className="fcta" aria-labelledby="ctaH">
      <div className="fcta__mesh" aria-hidden="true"></div>
      <div className="fcta__spark" aria-hidden="true"><i style={{ left: '1%', top: '45%', width: '3px', height: '3px', animationDuration: '9s', animationDelay: '-0s' }}></i><i style={{ left: '40%', top: '74%', width: '5px', height: '5px', animationDuration: '16s', animationDelay: '-11s' }}></i><i style={{ left: '76%', top: '48%', width: '4px', height: '4px', animationDuration: '14s', animationDelay: '-10s' }}></i><i style={{ left: '12%', top: '77%', width: '3px', height: '3px', animationDuration: '12s', animationDelay: '-9s' }}></i><i style={{ left: '48%', top: '51%', width: '5px', height: '5px', animationDuration: '10s', animationDelay: '-8s' }}></i><i style={{ left: '84%', top: '80%', width: '4px', height: '4px', animationDuration: '17s', animationDelay: '-7s' }}></i><i style={{ left: '20%', top: '54%', width: '3px', height: '3px', animationDuration: '15s', animationDelay: '-6s' }}></i><i style={{ left: '56%', top: '83%', width: '5px', height: '5px', animationDuration: '13s', animationDelay: '-5s' }}></i><i style={{ left: '98%', top: '57%', width: '4px', height: '4px', animationDuration: '11s', animationDelay: '-4s' }}></i><i style={{ left: '35%', top: '86%', width: '3px', height: '3px', animationDuration: '9s', animationDelay: '-3s' }}></i><i style={{ left: '71%', top: '60%', width: '5px', height: '5px', animationDuration: '16s', animationDelay: '-2s' }}></i><i style={{ left: '7%', top: '89%', width: '4px', height: '4px', animationDuration: '14s', animationDelay: '-1s' }}></i><i style={{ left: '43%', top: '63%', width: '3px', height: '3px', animationDuration: '12s', animationDelay: '-0s' }}></i><i style={{ left: '79%', top: '92%', width: '5px', height: '5px', animationDuration: '10s', animationDelay: '-11s' }}></i><i style={{ left: '15%', top: '66%', width: '4px', height: '4px', animationDuration: '17s', animationDelay: '-10s' }}></i><i style={{ left: '58%', top: '95%', width: '3px', height: '3px', animationDuration: '15s', animationDelay: '-9s' }}></i><i style={{ left: '94%', top: '69%', width: '5px', height: '5px', animationDuration: '13s', animationDelay: '-8s' }}></i><i style={{ left: '30%', top: '98%', width: '4px', height: '4px', animationDuration: '11s', animationDelay: '-7s' }}></i><i style={{ left: '66%', top: '72%', width: '3px', height: '3px', animationDuration: '9s', animationDelay: '-6s' }}></i><i style={{ left: '2%', top: '46%', width: '5px', height: '5px', animationDuration: '16s', animationDelay: '-5s' }}></i><i style={{ left: '38%', top: '75%', width: '4px', height: '4px', animationDuration: '14s', animationDelay: '-4s' }}></i><i style={{ left: '74%', top: '49%', width: '3px', height: '3px', animationDuration: '12s', animationDelay: '-3s' }}></i></div>
      <div className="container fcta__in">
        <h2 className="fcta__t" id="ctaH" data-reveal={true}>Your first claim is<br />thirty seconds away.</h2>
        <p className="fcta__s" data-reveal={true}>No deposit, no KYC, no minimum balance. Claim the faucet, clear one offer, and withdraw from 0.010000 USDT.</p>
        <div className="row gap-3 wrap" style={{ justifyContent: 'center', marginTop: 'var(--s-8)' }} data-reveal={true}>
          <Link className="btn btn--onGrad btn--lg mag" href="/register" data-mag={true}>
            <span className="mag__in">Start earning free crypto
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M4 12h16" /><path d="m14 6 6 6-6 6" /></svg>
            </span>
          </Link>
        </div>
        <p className="fcta__meta" data-reveal={true}>{meta}</p>
      </div>
    </section>
  );
}
