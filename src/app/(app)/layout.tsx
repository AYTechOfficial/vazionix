import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { brand } from '@/lib/brand';
import { AppShell } from '@/components/shell/AppShell';
import { AdslabScript } from '@/components/ads/AdslabScript';
import { getAdConfig, getRates, getSiteConfig } from '@/server/config';
import { getSessionClaims } from '@/server/session';
import { getProfile, touchUser } from '@/server/users';

/* ============================================================================
   AUTHENTICATED LAYOUT
   ----------------------------------------------------------------------------
   The gate for every route in this group. Three things happen here and nowhere
   else:

   1. THE SESSION IS VERIFIED. `getSessionClaims` reads the httpOnly cookie and
      verifies it with the Admin SDK, `checkRevoked: true`. No session means a
      redirect to /login carrying the intended path, so a deep link survives the
      round-trip.

   2. THE PROFILE, RATES AND AD MAP ARE FETCHED ONCE. All three are handed to the
      shell as props, so the header balance is correct in the initial HTML and a
      page with a dozen ad slots costs one Firestore read rather than a dozen.

   3. A SUSPENDED ACCOUNT IS STOPPED HERE. It cannot be stopped only in the API,
      because a suspended user should not see an earning UI at all.

   The sidebar collapse state is read from a cookie on the SERVER so the grid
   renders at the right width immediately — doing it client-side flashes a 256px
   sidebar and snaps to 72px on every navigation for anyone who prefers the rail.
   ========================================================================== */

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const claims = await getSessionClaims();
  if (!claims) redirect('/login');

  const [cookieStore, profile, rates, ads, site] = await Promise.all([
    cookies(),
    getProfile(claims.uid, claims.emailVerified),
    getRates(),
    getAdConfig(),
    getSiteConfig(),
  ]);

  /* No profile document for a verified session means the signup half-failed.
     `ensureUser` repairs it on the next session mint, so send them through the
     login round-trip rather than rendering a shell with no account behind it. */
  if (!profile) redirect('/login?repair=1');

  if (profile.suspended) redirect('/suspended');

  /* Fire-and-forget: drives the "online now" counter and the dormancy sweep. */
  void touchUser(claims.uid);

  const collapsed = cookieStore.get(`${brand.slug}-sidebar`)?.value === '1';

  const announcement = site.maintenance
    ? { message: site.maintenanceMessage, tone: 'warning' as const }
    : site.announcement
      ? { message: site.announcement, tone: site.announcementTone }
      : !profile.emailVerified
        ? {
            message: 'Verify your email address to enable withdrawals. Check your inbox for the link.',
            tone: 'info' as const,
          }
        : null;

  return (
    <>
      {/* AdsLab SDK: signed-in users only, so every impression is attributable. */}
      <AdslabScript userId={claims.uid} />
      <AppShell
        initialCollapsed={collapsed}
        profile={profile}
        rates={{ usdPerToken: rates.usdPerToken, spot: rates.spot, updatedAt: rates.updatedAt }}
        ads={ads}
        announcement={announcement}
      >
        {children}
      </AppShell>
    </>
  );
}
