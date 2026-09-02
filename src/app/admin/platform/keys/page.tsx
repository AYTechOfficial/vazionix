import type { Metadata } from 'next';

import { nf } from '@/lib/format';
import { requirePermission } from '@/lib/admin/guard';
import { captchaProvider, captchaSiteKey } from '@/lib/captcha/config';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { Alert } from '@/components/ui/Alert';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';

export const metadata: Metadata = { title: 'API keys' };

/* ============================================================================
   /admin/platform/keys — which credentials exist, never what they are
   ----------------------------------------------------------------------------
   THIS SCREEN RENDERS BOOLEANS, NOT VALUES. Every row below is `Boolean(env)` and
   nothing else. A console that displays a secret — even masked, even to a Super Admin
   — has moved that secret into a browser, a screenshot, a screen share and a support
   video, and no amount of asterisks undoes that.

   Rotation is not offered here either. Rotating a key means editing the deployment
   environment and restarting; a button that wrote a new secret into Firestore would
   create a second place credentials live, which is exactly the thing to avoid. So this
   is a checklist: what is set, what is missing, what breaks while it is missing.
   ========================================================================== */

export const dynamic = 'force-dynamic';

interface KeyRow {
  env: string;
  purpose: string;
  set: boolean;
  consequence: string;
}

export default async function KeysPage() {
  await requirePermission('keys.manage');

  const has = (name: string): boolean => Boolean((process.env[name] ?? '').trim());

  const rows: KeyRow[] = [
    {
      env: 'FIREBASE_SERVICE_ACCOUNT_KEY',
      purpose: 'Admin SDK — every server read and write, and session cookie verification',
      set: has('FIREBASE_SERVICE_ACCOUNT_KEY'),
      consequence: 'Nothing works. Every page falls back to empty data and the console cannot verify a login.',
    },
    {
      env: 'FAUCETPAY_API_KEY',
      purpose: 'Automated FaucetPay payouts',
      set: has('FAUCETPAY_API_KEY'),
      consequence: 'Approve is withheld on FaucetPay rows; requests queue with tokens locked.',
    },
    {
      env: 'CWALLET_API_KEY',
      purpose: 'Automated CWallet payouts',
      set: has('CWALLET_API_KEY'),
      consequence: 'Approve is withheld on CWallet rows.',
    },
    {
      env: 'CAPTCHA_SECRET_KEY',
      purpose: 'Server-side captcha verification',
      set: has('CAPTCHA_SECRET_KEY'),
      consequence: 'Captcha tokens cannot be verified, so gated modules pass everyone through.',
    },
    {
      env: 'NEXT_PUBLIC_CAPTCHA_SITE_KEY',
      purpose: 'Captcha widget on the client',
      set: Boolean(captchaSiteKey),
      consequence: 'No widget renders. Combined with the secret, this is what makes captcha real.',
    },
    {
      env: 'NEXT_PUBLIC_SITE_URL',
      purpose: 'Canonical origin for referral links, offerwall postbacks and metadata',
      set: has('NEXT_PUBLIC_SITE_URL'),
      consequence: 'Falls back to localhost, so referral links and postback URLs are wrong in production.',
    },
    {
      env: 'STAFF_REQUIRE_MFA',
      purpose: 'Staff MFA enforcement (defaults to on when unset)',
      set: has('STAFF_REQUIRE_MFA'),
      consequence: 'Unset means enforced, which is the safe default — set it to false only while enrolling.',
    },
  ];

  const missing = rows.filter((r) => !r.set);
  const critical = missing.filter((r) => r.env === 'FIREBASE_SERVICE_ACCOUNT_KEY').length;

  return (
    <ScaffoldPage
      perm="keys.manage"
      title="API keys"
      sub={`${nf(rows.length - missing.length)} of ${nf(rows.length)} credentials present · values are never displayed`}
      kpis={[
        {
          label: 'Present',
          value: `${nf(rows.length - missing.length)} / ${nf(rows.length)}`,
          sub: 'checked as presence only',
          tone: missing.length ? 'danger' : 'success',
        },
        {
          label: 'Captcha provider',
          value: captchaProvider === 'none' ? 'none' : captchaProvider,
          sub: captchaSiteKey ? 'site key present' : 'no site key',
          tone: captchaSiteKey ? 'default' : 'danger',
        },
        {
          label: 'Rotation from here',
          value: 'Not offered',
          sub: 'rotate in the deployment environment',
        },
      ]}
    >
      {critical ? (
        <Alert tone="danger">
          <strong>FIREBASE_SERVICE_ACCOUNT_KEY is not set.</strong> The Admin SDK cannot start, so every read
          returns empty and no login can be verified. Nothing else on this list matters until it is.
        </Alert>
      ) : null}

      <Alert tone="info">
        <strong>No secret value is rendered on this page.</strong> Each row is the result of{' '}
        <code className="font-mono text-12">Boolean(process.env[name])</code>. Masking a secret still puts it in
        a screenshot and a screen share, so it is not shown at all.
      </Alert>

      <Card as="section">
        <CardHead>
          <div>
            <CardTitle>Credentials</CardTitle>
            <CardSub>What each one is for, and what breaks without it</CardSub>
          </div>
        </CardHead>
        <div className="w-full overflow-auto">
          <table className="vf-table">
            <caption className="sr-only">
              Environment credentials, whether each is present, and the consequence of absence
            </caption>
            <thead>
              <tr>
                <th scope="col">Variable</th>
                <th scope="col">State</th>
                <th scope="col">Purpose</th>
                <th scope="col">If missing</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.env}>
                  <td className="font-mono text-12">{row.env}</td>
                  <td>
                    {row.set ? <Pill tone="success">set</Pill> : <Pill tone="danger">unset</Pill>}
                  </td>
                  <td className="max-w-[300px] text-text-3">{row.purpose}</td>
                  <td className="max-w-[340px] text-text-3">{row.consequence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <CardBody className="border-t border-line text-12 leading-body text-text-3">
          Ad network credentials are not in this list because they are not credentials — a network tag is public
          markup pasted per placement under Ads → Inventory, and the env fallback for each one is named on that
          screen.
        </CardBody>
      </Card>
    </ScaffoldPage>
  );
}
