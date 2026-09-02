import { brand } from '@/lib/brand';
import { relative } from '@/lib/format';
import { compact } from '@/lib/format';
import { CountryChip } from '@/components/ui/Avatar';
import { BrandLock } from '@/components/brand/BrandMark';
import { AdUnit } from '@/components/ads/AdUnit';
import { AdProvider } from '@/components/ads/AdProvider';
import { getAdConfig } from '@/server/config';
import { getPayoutTicker, getPlatformStats } from '@/server/stats';

/* ============================================================================
   AUTH LAYOUT
   ----------------------------------------------------------------------------
   Split shell: the form on the left, live social proof on the right. Login is a
   page rather than a modal over the marketing site, because a failed login in a
   modal returns you to a marketing page with the error out of view.

   THE PROOF RAIL IS REAL
   It lists actual completed withdrawals from `/withdrawals`, newest first. With
   none yet it says so and shows the live member and claim counters instead —
   an empty state is credible in a way that invented testimonials are not.

   Revalidated every 60 seconds: identical for every visitor, and the sign-in page
   is the highest-traffic route on the site.
   ========================================================================== */

export const revalidate = 60;

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const [ticker, stats, ads] = await Promise.all([
    getPayoutTicker(10),
    getPlatformStats(),
    getAdConfig(),
  ]);

  return (
    <AdProvider units={ads.units} behaviour={ads.behaviour}>
      <div className="ambient-mesh grid min-h-screen lg:grid-cols-[minmax(0,1fr)_460px]">
        <main className="relative z-[1] flex flex-col justify-center px-6 py-12 sm:px-12">
          <div className="mx-auto w-full max-w-[420px]">
            <BrandLock href="/" className="mb-8" />
            {children}

            {/* The only unit on the auth pages — the form stays clean. */}
            <AdUnit placement="auth.belowForm" className="mt-8" />
          </div>
        </main>

        <aside className="relative z-[1] hidden flex-col justify-center border-l border-line bg-surface-1 px-10 lg:flex">
          {ticker.length > 0 ? (
            <>
              <h2 className="text-20 font-semibold tracking-snug">Recently paid out</h2>
              <p className="mt-1 text-13 text-text-3">
                Automated rails settle in under a minute. On-chain payouts are batched and land within the
                window quoted on your receipt.
              </p>
              <ul className="mt-6 flex flex-col gap-2">
                {ticker.map((p, index) => (
                  <li
                    key={`${p.username}-${p.at}-${index}`}
                    className="flex items-center gap-3 rounded-sm border border-line bg-surface-2 px-3 py-2"
                  >
                    <CountryChip code={p.countryCode} />
                    <span className="min-w-0 flex-1 truncate text-13 text-text-2">{p.username}</span>
                    <span className="font-mono text-13 tabular text-mint">
                      {p.amount} {p.coin}
                    </span>
                    <span className="w-[62px] text-right text-11 text-text-3">{relative(p.at)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <h2 className="text-20 font-semibold tracking-snug">{brand.tagline}</h2>
              <p className="mt-1 text-13 leading-body text-text-3">{brand.description}</p>
              <dl className="mt-8 grid grid-cols-2 gap-4">
                {[
                  { label: 'Members', value: compact(stats.members) },
                  { label: 'Online now', value: compact(stats.onlineNow) },
                  { label: 'Claims paid', value: compact(stats.claimsAllTime) },
                  { label: 'Payouts sent', value: compact(stats.withdrawalsAllTime) },
                ].map((item) => (
                  <div key={item.label} className="rounded-md border border-line bg-surface-2 p-4">
                    <dt className="text-11 uppercase tracking-wide text-text-3">{item.label}</dt>
                    <dd className="mt-1 font-mono text-20 font-semibold tabular text-text">{item.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-6 text-11 text-text-3">
                These are live counters, updated as claims and payouts land.
              </p>
            </>
          )}
        </aside>
      </div>
    </AdProvider>
  );
}
