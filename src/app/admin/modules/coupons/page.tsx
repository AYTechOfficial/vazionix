import type { Metadata } from 'next';

import { compact, nf } from '@/lib/format';
import { allowFor, requirePermission } from '@/lib/admin/guard';
import { listCatalogue } from '@/server/admin';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { CatalogueEditor, type CatalogueField } from '@/components/admin/CatalogueEditor';
import { Alert } from '@/components/ui/Alert';

export const metadata: Metadata = { title: 'Coupons' };

/* ============================================================================
   /admin/modules/coupons — promo codes
   ----------------------------------------------------------------------------
   THE CODE IS THE DOCUMENT ID, upper-cased, and that is enforced server-side in
   the catalogue route rather than here. Two consequences worth knowing before you
   create one: redemption is a single document read rather than a query, and two
   coupons can never share a code — the second save overwrites the first instead of
   creating an ambiguous pair.

   `maxRedemptions` is the only thing standing between a leaked code and the token
   supply, so it is required in spirit even where the form allows zero. A code with
   no cap posted to a coupon-sharing site is an open faucet with no cooldown.
   ========================================================================== */

export const dynamic = 'force-dynamic';

const FIELDS: CatalogueField[] = [
  {
    key: 'code',
    label: 'Code',
    kind: 'text',
    column: true,
    required: true,
    placeholder: 'WELCOME2026',
    hint: 'Becomes the document id, upper-cased. 3–32 characters: letters, numbers, underscore or hyphen.',
  },
  { key: 'tokens', label: 'Tokens granted', kind: 'number', min: 0, column: true, defaultValue: 500 },
  {
    key: 'adCredit',
    label: 'Ad credit granted',
    kind: 'number',
    min: 0,
    defaultValue: 0,
    hint: 'For advertiser-facing codes. Members see the token value only.',
  },
  {
    key: 'discountLabel',
    label: 'Discount label',
    kind: 'text',
    placeholder: '10% off an advertising package',
    hint: 'Free text shown on redemption when the reward is not just tokens.',
  },
  {
    key: 'maxRedemptions',
    label: 'Maximum redemptions',
    kind: 'number',
    min: 0,
    column: true,
    defaultValue: 100,
    hint: '0 is unlimited, which is rarely what you want for a public code.',
  },
  {
    key: 'onePerUser',
    label: 'One redemption per member',
    kind: 'switch',
    defaultValue: true,
    hint: 'Off lets the same account redeem repeatedly until the cap is reached.',
  },
  {
    key: 'expiresAt',
    label: 'Expires',
    kind: 'date',
    hint: 'Empty never expires. A dated code is easier to retire than a remembered promise.',
  },
  { key: 'enabled', label: 'Enabled', kind: 'switch', defaultValue: true },
];

export default async function CouponsModulePage() {
  const session = await requirePermission('earn.view');
  const allow = allowFor(session);

  const rows = await listCatalogue('coupons', 200);
  const live = rows.filter((r) => r.enabled);
  const uncapped = live.filter((r) => !Number(r.fields['maxRedemptions']));
  const exposure = live.reduce(
    (sum, r) => sum + (Number(r.fields['tokens']) || 0) * (Number(r.fields['maxRedemptions']) || 0),
    0,
  );

  return (
    <ScaffoldPage
      perm="earn.view"
      title="Coupons"
      sub={`${nf(live.length)} of ${nf(rows.length)} codes active`}
      kpis={[
        { label: 'Codes', value: nf(rows.length), sub: `${nf(live.length)} active` },
        {
          label: 'Capped exposure',
          value: compact(exposure),
          sub: 'tokens if every capped code is fully redeemed',
        },
        {
          label: 'Uncapped codes',
          value: nf(uncapped.length),
          sub: uncapped.length ? 'unbounded token exposure' : 'every active code has a cap',
          tone: uncapped.length ? 'danger' : 'success',
        },
      ]}
    >
      {uncapped.length ? (
        <Alert tone="danger">
          <strong>
            {uncapped.length} active code{uncapped.length > 1 ? 's have' : ' has'} no redemption cap.
          </strong>{' '}
          Set <code className="font-mono text-12">maxRedemptions</code> on each. A leaked uncapped code mints
          tokens until somebody notices.
        </Alert>
      ) : null}

      <CatalogueEditor
        collection="coupons"
        noun="Coupon"
        fields={FIELDS}
        rows={rows}
        canEdit={allow('coupon.manage')}
        titleKey="code"
      />
    </ScaffoldPage>
  );
}
