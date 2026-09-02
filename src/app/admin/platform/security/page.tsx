import type { Metadata } from 'next';

import { dateTime, nf } from '@/lib/format';
import { requirePermission } from '@/lib/admin/guard';
import { getSiteConfig } from '@/server/config';
import { listAudit, countWhere } from '@/server/admin';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { NotConfigured } from '@/components/admin/NotConfigured';
import { Alert } from '@/components/ui/Alert';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';

export const metadata: Metadata = { title: 'Security' };

/* ============================================================================
   /admin/platform/security — the controls that are actually enforced
   ----------------------------------------------------------------------------
   Every row on this screen reflects something a request passes through, read from
   where it is really configured rather than from a settings document that nothing
   consumes.

   MFA is `STAFF_REQUIRE_MFA`. The server guard treats a staff token without an
   `mfa` claim as not-staff when it is on, which is stricter than warning: it refuses
   rather than flags.

   LOCKDOWN is `site.maintenance`. One switch, not two — a separate "lockdown" flag
   that could disagree with maintenance mode about whether the platform is open is
   worse than no lockdown at all.

   REFUSED ATTEMPTS come from the audit log, where a denied permission is written as
   `<perm>.denied`. Repeated denials on a money permission are the signal this screen
   exists to surface.
   ========================================================================== */

export const dynamic = 'force-dynamic';

export default async function SecurityPage() {
  await requirePermission('audit.view');

  const [site, audit, staff] = await Promise.all([
    getSiteConfig(),
    listAudit(60, null),
    countWhere('staff'),
  ]);

  const mfaRequired = (process.env['STAFF_REQUIRE_MFA'] ?? 'true') !== 'false';
  const denials = audit.rows.filter((r) => r.action.endsWith('.denied'));
  const moneyDenials = denials.filter(
    (r) => r.action.startsWith('balance.') || r.action.startsWith('withdrawal.'),
  );

  const controls: Array<{ label: string; state: string; ok: boolean; where: string; note: string }> = [
    {
      label: 'Staff MFA required',
      state: mfaRequired ? 'Enforced' : 'Not enforced',
      ok: mfaRequired,
      where: 'STAFF_REQUIRE_MFA',
      note: mfaRequired
        ? 'A staff token without an mfa claim is treated as not-staff and refused.'
        : 'Set this back to true once the first admin account has enrolled.',
    },
    {
      label: 'Session cookie revocation check',
      state: 'Always on',
      ok: true,
      where: 'verifySessionCookie(cookie, true)',
      note: 'Costs one round trip and is what makes revoking a session take seconds rather than an hour.',
    },
    {
      label: 'Platform lockdown',
      state: site.maintenance ? 'ACTIVE' : 'Off',
      ok: !site.maintenance,
      where: '/config/site.maintenance',
      note: site.maintenance
        ? 'Earning and withdrawals are frozen and staff money actions are refused.'
        : 'The same switch as maintenance mode, deliberately — two flags could disagree.',
    },
    {
      label: 'Data-layer permission checks',
      state: 'Always on',
      ok: true,
      where: 'firestore.rules → hasPerm()',
      note: 'Survives a caller who skips this server entirely and hits the Firestore REST API with a stolen token.',
    },
    {
      label: 'IP allowlist for staff',
      state: 'Not implemented',
      ok: false,
      where: '—',
      note: 'Nothing reads an allowlist. Adding one belongs in middleware, where it can refuse before a page renders.',
    },
  ];

  return (
    <ScaffoldPage
      perm="audit.view"
      title="Security"
      sub="What is enforced, where it is configured, and what is not implemented"
      kpis={[
        {
          label: 'Staff MFA',
          value: mfaRequired ? 'Enforced' : 'Off',
          sub: 'STAFF_REQUIRE_MFA',
          tone: mfaRequired ? 'success' : 'danger',
        },
        {
          label: 'Lockdown',
          value: site.maintenance ? 'ACTIVE' : 'Off',
          sub: '/config/site.maintenance',
          tone: site.maintenance ? 'danger' : 'default',
        },
        { label: 'Staff records', value: nf(staff), sub: 'mirrored in /staff' },
        {
          label: 'Refused attempts',
          value: nf(denials.length),
          sub: 'in the last 60 audit rows',
          tone: denials.length ? 'danger' : 'success',
        },
      ]}
    >
      {!mfaRequired ? (
        <Alert tone="danger">
          <strong>STAFF_REQUIRE_MFA is set to false.</strong> A staff session without a second factor is
          accepted. This exists to enrol the very first admin account — remove it as soon as that is done.
        </Alert>
      ) : null}

      {moneyDenials.length ? (
        <Alert tone="warning">
          <strong>
            {moneyDenials.length} refused attempt{moneyDenials.length > 1 ? 's' : ''} on a money permission
          </strong>{' '}
          in the last 60 audit rows. Either somebody needs a grant they do not have, or somebody is probing.
          Both are worth a look.
        </Alert>
      ) : null}

      <Card as="section">
        <CardHead>
          <div>
            <CardTitle>Controls</CardTitle>
            <CardSub>Read from the environment and /config/site at request time</CardSub>
          </div>
        </CardHead>
        <div className="w-full overflow-auto">
          <table className="vf-table">
            <caption className="sr-only">Security controls, their state and where each is configured</caption>
            <thead>
              <tr>
                <th scope="col">Control</th>
                <th scope="col">State</th>
                <th scope="col">Configured in</th>
                <th scope="col">Note</th>
              </tr>
            </thead>
            <tbody>
              {controls.map((control) => (
                <tr key={control.label}>
                  <td className="text-text-2">{control.label}</td>
                  <td>
                    <Pill tone={control.ok ? 'success' : 'danger'}>{control.state}</Pill>
                  </td>
                  <td className="font-mono text-11 text-text-3">{control.where}</td>
                  <td className="max-w-[420px] text-text-3">{control.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {denials.length ? (
        <Card as="section">
          <CardHead>
            <div>
              <CardTitle>Refused attempts</CardTitle>
              <CardSub>From the audit log — a denial is logged as &lt;perm&gt;.denied</CardSub>
            </div>
          </CardHead>
          <div className="w-full overflow-auto">
            <table className="vf-table">
              <caption className="sr-only">Recently refused permission checks</caption>
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Permission</th>
                  <th scope="col">Target</th>
                  <th scope="col">Detail</th>
                </tr>
              </thead>
              <tbody>
                {denials.map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap text-text-3">{dateTime(row.at)}</td>
                    <td>
                      <Pill tone="danger">{row.action.replace('.denied', '')}</Pill>
                    </td>
                    <td className="font-mono text-12 text-text-3">{row.target || '—'}</td>
                    <td className="text-text-3">{row.detail || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <NotConfigured
          what="Refused permission attempts"
          collection="/auditLog where action ends with .denied"
          how="A row is written when a staff request fails a permission check. None in the most recent 60 entries, which is the healthy state."
        />
      )}

      <Card as="section">
        <CardHead>
          <div>
            <CardTitle>Anti-abuse configuration</CardTitle>
            <CardSub>Not a document — it is code and configuration</CardSub>
          </div>
        </CardHead>
        <CardBody className="text-13 leading-body text-text-3">
          <p>
            Rate limits and captcha requirements are not stored in a settings collection. Captcha is per module
            (<code className="font-mono text-12">faucet.requireCaptcha</code> and its siblings, edited under
            Modules) with the provider set by{' '}
            <code className="font-mono text-12">NEXT_PUBLIC_CAPTCHA_PROVIDER</code>; earning limits are the daily
            caps on the Limits screen.
          </p>
          <p className="mt-2">
            That is deliberate: each control lives next to the thing it governs, so nobody tunes a global
            &quot;abuse&quot; document and wonders why the faucet did not change.
          </p>
        </CardBody>
      </Card>
    </ScaffoldPage>
  );
}
