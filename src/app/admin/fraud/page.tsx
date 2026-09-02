import type { Metadata } from 'next';
import Link from 'next/link';

import { compact, nf, relative } from '@/lib/format';
import { requirePermission } from '@/lib/admin/guard';
import { countWhere, listCatalogue, listUsers } from '@/server/admin';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { NotConfigured } from '@/components/admin/NotConfigured';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { CountryChip } from '@/components/ui/Avatar';
import { RiskMeter } from '@/components/admin/RiskMeter';

export const metadata: Metadata = { title: 'Fraud review' };

/* ============================================================================
   /admin/fraud — the accounts worth a second look
   ----------------------------------------------------------------------------
   Two halves, and only one of them is populated today.

   THE RISK LIST IS REAL. `listUsers` computes an explainable score per row from
   account age, earn rate, unverified email, country resolution and unqualified
   referral fan-out. It is deliberately not machine-learned: an admin suspending an
   account has to be able to say why, and "0.7 from the model" is not a reason anybody
   can defend in a support reply.

   THE CLUSTER LIST IS NOT. Device and IP clustering needs a fingerprint recorded per
   session, and this build records `signupIp` on the user document and nothing else.
   No cluster is inferred from that, because a shared IP is a household as often as it
   is a farm, and a screen that called it a ring would get people banned for living
   together.
   ========================================================================== */

export const dynamic = 'force-dynamic';

export default async function FraudPage() {
  await requirePermission('fraud.review');

  const [flags, newest, suspended, unverified, members] = await Promise.all([
    listCatalogue('fraudFlags', 100),
    listUsers({ limit: 40, sort: 'createdAt' }),
    countWhere('users', [['suspended', '==', true]]),
    countWhere('users', [['emailVerified', '==', false]]),
    countWhere('users'),
  ]);

  const risky = newest.rows.filter((r) => r.riskScore >= 40).sort((a, b) => b.riskScore - a.riskScore);
  const open = flags.filter((f) => f.fields['status'] === 'review').length;

  return (
    <ScaffoldPage
      perm="fraud.review"
      title="Fraud review"
      sub={`${nf(risky.length)} of the ${nf(newest.rows.length)} newest accounts score 40 or above`}
      kpis={[
        {
          label: 'Flags to review',
          value: nf(open),
          sub: open ? 'documents in /fraudFlags' : 'nothing flagged',
          tone: open ? 'danger' : 'default',
        },
        {
          label: 'Elevated risk',
          value: nf(risky.length),
          sub: 'in the newest 40 accounts',
          tone: risky.length ? 'danger' : 'success',
        },
        { label: 'Suspended', value: nf(suspended), sub: 'currently held' },
        {
          label: 'Unverified email',
          value: nf(unverified),
          sub: `of ${compact(members)} accounts`,
        },
      ]}
    >
      {risky.length ? (
        <Card as="section">
          <CardHead>
            <div>
              <CardTitle>Elevated risk in recent registrations</CardTitle>
              <CardSub>Scored on account age, earn rate, verification, country and referral fan-out</CardSub>
            </div>
          </CardHead>
          <div className="w-full overflow-auto">
            <table className="vf-table">
              <caption className="sr-only">Recent accounts with an elevated risk score</caption>
              <thead>
                <tr>
                  <th scope="col">Member</th>
                  <th scope="col">Country</th>
                  <th scope="col" className="th-num">
                    Earned
                  </th>
                  <th scope="col" className="th-num">
                    Referrals
                  </th>
                  <th scope="col">Email</th>
                  <th scope="col">Joined</th>
                  <th scope="col" className="th-num">
                    Risk
                  </th>
                </tr>
              </thead>
              <tbody>
                {risky.map((row) => (
                  <tr key={row.uid}>
                    <td>
                      <Link href={`/admin/users/${row.uid}`} className="font-semibold hover:text-mint">
                        {row.username}
                      </Link>
                    </td>
                    <td>
                      <CountryChip code={row.countryCode} />
                    </td>
                    <td className="td-num tabular">{compact(row.totalEarned)}</td>
                    <td className="td-num tabular text-text-3">{nf(row.referralCount)}</td>
                    <td className="text-text-3">{row.emailVerified ? 'verified' : 'unverified'}</td>
                    <td className="text-text-3">{relative(row.createdAt)}</td>
                    <td className="td-num">
                      <RiskMeter score={row.riskScore} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <CardBody className="border-t border-line text-12 leading-body text-text-3">
            A high score is a prompt to look, not a verdict. The inputs are listed above precisely so a decision
            can be justified in a reply to the member.
          </CardBody>
        </Card>
      ) : null}

      <NotConfigured
        what="Fraud clusters"
        collection="/fraudFlags"
        how="A document appears when something writes one — a scheduled job correlating device fingerprints, or an operator flagging an account by hand. Neither exists in this build: only signupIp is recorded per account, which is not enough to call a cluster."
      />
    </ScaffoldPage>
  );
}
