'use client';

import * as React from 'react';
import Link from 'next/link';

import { nf } from '@/lib/format';
import type { ReferralTier } from '@/lib/models';

/* ============================================================================
   REFERRAL SIMULATOR
   ----------------------------------------------------------------------------
   Drag the slider, see the commission. Client because it is a slider.

   THE TIERS AND THE RATE COME FROM `/config/economy`, NOT FROM A COPY OF IT.
   The prototype hardcoded its own four-tier table, which is exactly the kind of
   marketing number that drifts from the product until the page is quietly lying.
   The tiers are passed in from the page, so if you change a commission rate in
   Admin → Modules → Referrals, this slider changes with it.

   `PER_REFERRAL_MONTHLY` is the one modelled figure left, and it is labelled as an
   assumption in the copy beneath the slider — it has to be, because what a
   referral earns is a behaviour, not a setting. The token rate is live.
   ========================================================================== */

/** Tokens a month for an active referral: roughly one offerwall completion plus
    daily faucet claims. An assumption, stated as one in the visible copy. */
const PER_REFERRAL_MONTHLY = 250_000;

export function ReferralSimulator({
  tiers,
  usdPerToken,
}: {
  tiers: ReferralTier[];
  usdPerToken: number;
}) {
  const [friends, setFriends] = React.useState(10);

  const tierIndex = React.useMemo(() => {
    let index = 0;
    tiers.forEach((t, i) => {
      if (friends >= Math.max(1, t.at)) index = i;
    });
    return index;
  }, [friends, tiers]);

  const tier = tiers[tierIndex] ?? { name: 'Bronze', at: 0, rate: 5, perk: '' };
  const tokensPerMonth = friends * PER_REFERRAL_MONTHLY * (tier.rate / 100);
  const usdPerMonth = tokensPerMonth * usdPerToken;

  return (
    <section className="sec" id="advertise" aria-labelledby="simH">
      <div className="container">
        <div className="sec__head">
          <p className="sec__eyebrow">Referral simulator</p>
          <h2 className="sec__title" id="simH">Move the slider.<br />See the commission.</h2>
          <p className="sec__lead">A lifetime share of everything your invites earn. Drag to model your own network.</p>
        </div>

        <div className="sim">
          <div className="sim__grid">
            <div className="sim__left">
              <div className="sim__val">
                <span className="num" id="simFriends">{friends}</span>
                <span className="sim__friends" id="simFriendsLbl">{friends === 1 ? 'friend earning actively' : 'friends earning actively'}</span>
              </div>

              <label className="sr-only" htmlFor="simRange">Number of active referrals</label>
              <input
                     className="sim__range"
                     id="simRange"
                     type="range"
                     min={1}
                     max={50}
                     step={1}
                     value={friends}
                     onChange={(e) => setFriends(Number(e.target.value))}
                     aria-describedby="simOutDesc"
                     style={{ '--fill': `${(((friends - 1) / 49) * 100).toFixed(2)}%` } as React.CSSProperties}
                   />
              <div className="sim__scale"><span>1</span><span>5</span><span>20</span><span>50</span></div>

              <div className="sim__out" id="simOutDesc">
                <div>
                  <p className="sim__o-l">Your commission / month</p>
                  <p className="sim__o-v t-mint" id="simTokens">
                    {nf(Math.round(tokensPerMonth))} <span style={{ fontSize: 'var(--t-13)', color: 'var(--text-3)' }}>tokens</span>
                  </p>
                </div>
                <div>
                  <p className="sim__o-l">Worth today</p>
                  <p className="sim__o-v" id="simUsd">${usdPerMonth.toFixed(2)}</p>
                </div>
              </div>

              <p className="sim__note">
                Modelled on an active referral earning ~250,000 tokens a month (roughly one offerwall
                completion plus daily faucet claims), at the token rate of the balance shown above.
                Commission is paid the moment your referral earns, for as long as they stay active.
                Referrals count once they reach level 1.
              </p>
            </div>

            <div className="sim__right">
              <p className="sim__o-l" style={{ marginBottom: 'var(--s-4)' }}>Tier unlocked</p>
              <div className="sim__tiers" id="simTiers">
              {tiers.map((t, i) => (
                <div
                  key={t.name}
                  className={`sim__tier${tierIndex === i ? ' is-on' : ''}`}
                  data-tier={i}
                >
                  <div>
                    <div className="sim__tier-n">{t.name}</div>
                    <div className="sim__tier-p">
                      {t.at <= 1 ? 'From your first referral' : `From ${t.at} qualified`}
                    </div>
                  </div>
                  <div className="sim__tier-r">{t.rate}%</div>
                </div>
              ))}
              </div>
              <p className="sim__note" role="status" id="simTierNote">
                  {tier.name} — {tier.perk}
                </p>
              <Link className="btn btn--primary btn--block u-mt-6" href="/register">Get your referral link</Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
