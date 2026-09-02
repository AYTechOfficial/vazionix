import type { Metadata } from 'next';

import { nf } from '@/lib/format';
import { requirePermission } from '@/lib/admin/guard';
import { captchaEnabled, captchaProvider, captchaSpec } from '@/lib/captcha/config';
import { getEconomy } from '@/server/config';
import { countWhere } from '@/server/admin';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { NotConfigured } from '@/components/admin/NotConfigured';
import { Alert } from '@/components/ui/Alert';
import { Card, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';

export const metadata: Metadata = { title: 'Anti-abuse' };

/* ============================================================================
   /admin/platform/abuse — the controls that exist, and where they live
   ----------------------------------------------------------------------------
   There is no `/config/abuse` document, and this screen does not pretend there is.
   Anti-abuse in this product is four separate mechanisms, each configured next to the
   thing it governs:

     CAPTCHA        per module, in /config/economy (`faucet.requireCaptcha` etc.),
                    with the provider from the environment.
     DAILY CAPS     per module, in /config/economy — the Limits screen.
     WITHDRAW GATE  account age, verified email, minimum balance — also Limits.
     SUSPENSION     per account, from the user detail screen.

   Collecting them into one "abuse settings" document would give an operator a page
   that looks authoritative and changes nothing, because each consumer reads its own
   path. The table below is the map instead.
   ========================================================================== */

export const dynamic = 'force-dynamic';

export default async function AbusePage() {
  await requirePermission('security.config');

  const [economy, suspended, unverified] = await Promise.all([
    getEconomy(),
    countWhere('users', [['suspended', '==', true]]),
    countWhere('users', [['emailVerified', '==', false]]),
  ]);

  const spec = captchaSpec();

  const gates: Array<{ control: string; state: string; ok: boolean; where: string }> = [
    {
      control: 'Captcha provider',
      state: captchaEnabled ? spec.label : `${captchaProvider} — no site key`,
      ok: captchaEnabled,
      where: 'NEXT_PUBLIC_CAPTCHA_PROVIDER + CAPTCHA_SECRET_KEY',
    },
    {
      control: 'Captcha on faucet claims',
      state: economy.faucet.requireCaptcha ? 'Required' : 'Off',
      ok: economy.faucet.requireCaptcha,
      where: '/config/economy.faucet.requireCaptcha',
    },
    {
      control: 'Captcha on shortlink visits',
      state: economy.shortlinks.requireCaptcha ? 'Required' : 'Off',
      ok: economy.shortlinks.requireCaptcha,
      where: '/config/economy.shortlinks.requireCaptcha',
    },
    {
      control: 'Captcha on PTC views',
      state: economy.ptc.requireCaptcha ? 'Required' : 'Off',
      ok: economy.ptc.requireCaptcha,
      where: '/config/economy.ptc.requireCaptcha',
    },
    {
      control: 'Account age before first withdrawal',
      state: `${economy.withdraw.minAccountAgeHours} hours`,
      ok: economy.withdraw.minAccountAgeHours > 0,
      where: '/config/economy.withdraw.minAccountAgeHours',
    },
    {
      control: 'Verified email to withdraw',
      state: economy.withdraw.requireEmailVerified ? 'Required' : 'Off',
      ok: economy.withdraw.requireEmailVerified,
      where: '/config/economy.withdraw.requireEmailVerified',
    },
    {
      control: 'Referral qualifying level',
      state: `level ${economy.referrals.qualifyingLevel}`,
      ok: economy.referrals.qualifyingLevel > 0,
      where: '/config/economy.referrals.qualifyingLevel',
    },
  ];

  const weak = gates.filter((g) => !g.ok).length;

  return (
    <ScaffoldPage
      perm="security.config"
      title="Anti-abuse"
      sub={`${nf(gates.length - weak)} of ${nf(gates.length)} gates active`}
      kpis={[
        {
          label: 'Gates active',
          value: `${nf(gates.length - weak)} / ${nf(gates.length)}`,
          sub: weak ? 'see the table' : 'everything on',
          tone: weak ? 'danger' : 'success',
        },
        {
          label: 'Captcha',
          value: captchaEnabled ? 'Live' : 'Off',
          sub: captchaEnabled ? spec.label : 'no provider configured',
          tone: captchaEnabled ? 'success' : 'danger',
        },
        { label: 'Suspended accounts', value: nf(suspended), sub: 'held by a moderator' },
        { label: 'Unverified emails', value: nf(unverified), sub: 'across all accounts' },
      ]}
    >
      {!captchaEnabled ? (
        <Alert tone="danger">
          <strong>No captcha provider is configured.</strong> Every module with{' '}
          <code className="font-mono text-12">requireCaptcha</code> set passes callers through unverified,
          which on a faucet means a script can claim on a loop.
        </Alert>
      ) : null}

      <Card as="section">
        <CardHead>
          <div>
            <CardTitle>Gates in force</CardTitle>
            <CardSub>Each read from where its consumer reads it, not from a settings document</CardSub>
          </div>
        </CardHead>
        <div className="w-full overflow-auto">
          <table className="vf-table">
            <caption className="sr-only">Anti-abuse controls, their state and their configuration path</caption>
            <thead>
              <tr>
                <th scope="col">Control</th>
                <th scope="col">State</th>
                <th scope="col">Configured in</th>
              </tr>
            </thead>
            <tbody>
              {gates.map((gate) => (
                <tr key={gate.control}>
                  <td className="text-text-2">{gate.control}</td>
                  <td>
                    <Pill tone={gate.ok ? 'success' : 'danger'}>{gate.state}</Pill>
                  </td>
                  <td className="font-mono text-11 text-text-3">{gate.where}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <NotConfigured
        what="Rate-limit and IP reputation rules"
        collection="/config/abuse"
        how="No such document is read by anything. Per-IP rate limiting belongs in middleware or at the CDN, where it can refuse a request before it costs a Firestore read — not in a document the app consults after already doing the work."
      />
    </ScaffoldPage>
  );
}
