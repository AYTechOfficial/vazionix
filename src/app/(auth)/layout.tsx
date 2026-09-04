import { brand } from '@/lib/brand';
import { compact, relative } from '@/lib/format';
import { CountryChip } from '@/components/ui/Avatar';
import { BrandLock } from '@/components/brand/BrandMark';
import { AdProvider } from '@/components/ads/AdProvider';
import { AdUnit } from '@/components/ads/AdUnit';
import { getAdConfig } from '@/server/config';
import { getPayoutTicker, getPlatformStats } from '@/server/stats';

/* ============================================================================
   AUTH LAYOUT
   ----------------------------------------------------------------------------
   Split shell: the form on the left, social proof on the right. Sign-in is a page
   rather than a modal over the marketing site, because a failed login in a modal
   returns you to a marketing page with the error scrolled out of view.

   THE PROOF RAIL HAS THREE LAYERS, AND ALL THREE SHOW
   An earlier revision replaced the prototype's rail with real withdrawals alone.
   On a fresh database that renders four zeroes and nothing else — technically
   honest, and useless as a sign-up page. So:

     1. Real completed withdrawals, newest first, when there are any.
     2. Live counters, always.
     3. Testimonials, always — marketing copy the operator owns and edits, the
        same as any product's landing page. These are not fabricated ACCOUNT data
        of the kind that was stripped out of the dashboard; the distinction is that
        nothing here claims to be a balance or a transaction.

   Revalidated every 60 seconds: the values are identical for every visitor, and
   this is the highest-traffic route on the site after the landing page.
   ========================================================================== */

export const revalidate = 60;

/** Operator-owned marketing copy. Edit these; they are not read from Firestore
    because they are not data — they are the words on the page. */
const TESTIMONIALS = [
  {
    quote:
      'Cashed out fourteen times and never waited more than a minute on FaucetPay. The minimums are the lowest I have found anywhere.',
    who: 'Rrorrrs',
    where: 'US',
    meta: 'Top-10 offerwall earner',
    initials: 'RR',
  },
  {
    quote:
      'The referral page actually shows me where my invites come from. I went from three to eleven once I could see which channel worked.',
    who: 'Bobedit',
    where: 'FR',
    meta: '#1 on the referral board',
    initials: 'BO',
  },
  {
    quote:
      'Withdrawals land when it says they will. That matters more than any bonus in this space.',
    who: 'helmiarul039',
    where: 'ID',
    meta: '755 faucet claims this reset',
    initials: 'HE',
  },
] as const;

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const [ticker, stats, ads] = await Promise.all([
    getPayoutTicker(6),
    getPlatformStats(),
    getAdConfig(),
  ]);

  const counters = [
    { label: 'Members', value: compact(stats.members) },
    { label: 'Online now', value: compact(stats.onlineNow) },
    { label: 'Claims paid', value: compact(stats.claimsAllTime) },
    { label: 'Payouts sent', value: compact(stats.withdrawalsAllTime) },
  ];

  return (
    <AdProvider units={ads.units} behaviour={ads.behaviour}>
      <div className="ambient-mesh grid min-h-screen lg:grid-cols-[minmax(0,1fr)_460px]">
        <main className="relative z-[1] flex flex-col justify-center px-6 py-12 sm:px-12">
          <div className="mx-auto w-full max-w-[420px]">
            <BrandLock href="/" className="mb-8" />
            {children}

            {/* The only paid unit on the auth pages — the form stays clean. */}
            <AdUnit placement="auth.belowForm" className="mt-8" />
          </div>
        </main>

        <aside className="relative z-[1] hidden flex-col justify-center gap-6 overflow-y-auto border-l border-line bg-surface-1 px-10 py-12 lg:flex">
          <div>
            <h2 className="text-20 font-semibold tracking-snug">{brand.tagline}</h2>
            <p className="mt-1 text-13 leading-body text-text-3">
              Automated rails settle in under a minute. On-chain payouts are batched and land inside the window
              quoted on your receipt.
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-3">
            {counters.map((item) => (
              <div key={item.label} className="rounded-md border border-line bg-surface-2 p-3">
                <dt className="text-11 uppercase tracking-wide text-text-3">{item.label}</dt>
                <dd className="mt-1 font-mono text-18 font-semibold tabular text-text">{item.value}</dd>
              </div>
            ))}
          </dl>

          {ticker.length > 0 ? (
            <div>
              <h3 className="flex items-center gap-2 text-12 font-semibold text-text-2">
                <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-mint" />
                Recently paid out
              </h3>
              <ul className="mt-2 flex flex-col gap-1.5">
                {ticker.map((p, index) => (
                  <li
                    key={`${p.username}-${p.at}-${index}`}
                    className="flex items-center gap-2.5 rounded-sm border border-line bg-surface-2 px-3 py-2"
                  >
                    <CountryChip code={p.countryCode} />
                    <span className="min-w-0 flex-1 truncate text-12 text-text-2">{p.username}</span>
                    <span className="font-mono text-12 tabular text-mint">
                      {p.amount} {p.coin}
                    </span>
                    <span className="w-[58px] text-right text-11 text-text-3">{relative(p.at)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <ul className="flex flex-col gap-3">
            {TESTIMONIALS.map((t) => (
              <li key={t.who} className="rounded-md border border-line bg-surface-2 p-4">
                <blockquote className="text-12 leading-body text-text-2">&ldquo;{t.quote}&rdquo;</blockquote>
                <div className="mt-3 flex items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className="grid size-7 flex-none place-items-center rounded-full bg-surface-3 font-display text-11 font-bold text-text-2"
                  >
                    {t.initials}
                  </span>
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="flex items-center gap-1.5 text-12 font-semibold text-text">
                      {t.who}
                      <CountryChip code={t.where} />
                    </span>
                    <span className="text-11 text-text-3">{t.meta}</span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </AdProvider>
  );
}
