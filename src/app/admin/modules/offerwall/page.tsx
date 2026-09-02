import type { Metadata } from 'next';

import { compact, nf } from '@/lib/format';
import { absoluteUrl } from '@/lib/brand';
import { allowFor, requirePermission } from '@/lib/admin/guard';
import { countWhere, listCatalogue } from '@/server/admin';
import { getDailySeries } from '@/server/stats';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { CatalogueEditor, type CatalogueField } from '@/components/admin/CatalogueEditor';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';

export const metadata: Metadata = { title: 'Offerwall providers' };

/* ============================================================================
   /admin/modules/offerwall — third-party offer providers
   ----------------------------------------------------------------------------
   The highest-paying earning surface and the only one where an outside party tells
   us to credit a member. Two things on this screen carry the weight:

   THE POSTBACK URL, shown per provider. It is `/api/offerwall/{docId}` — the
   document id is the route segment, so a provider's postback cannot be pointed at
   another provider's secret by editing a query parameter.

   THE SIGNATURE MODE, which decides how that postback is verified. Every provider
   invented its own scheme; the four supported ones are named exactly rather than
   described loosely, because "HMAC" without the payload definition is not a
   specification and a mismatch here silently rejects every conversion.

   `iframeUrl` supports `{uid}`, `{username}` and `{country}` placeholders, which the
   offerwall page substitutes per member. A provider that only accepts a query
   parameter it calls something else still works — put the placeholder wherever the
   provider's documentation says the sub-id goes.
   ========================================================================== */

export const dynamic = 'force-dynamic';

const PROVIDER_FIELDS: CatalogueField[] = [
  { key: 'name', label: 'Provider name', kind: 'text', column: true, required: true, placeholder: 'BitLabs' },
  {
    key: 'blurb',
    label: 'Blurb',
    kind: 'longtext',
    hint: 'One line shown on the provider card. Say what kind of offers it carries.',
  },
  {
    key: 'iframeUrl',
    label: 'Wall URL',
    kind: 'url',
    required: true,
    placeholder: 'https://wall.example/?apikey=…&user_id={uid}&country={country}',
    hint: 'Supports {uid}, {username} and {country}. Substituted per member at render time.',
  },
  {
    key: 'secret',
    label: 'Postback secret',
    kind: 'text',
    hint: 'Used to verify the signature on incoming conversions. Never rendered to members.',
  },
  {
    key: 'signatureMode',
    label: 'Signature mode',
    kind: 'select',
    column: true,
    defaultValue: 'hmac_sha256_payload',
    options: [
      { value: 'hmac_sha256_payload', label: 'HMAC-SHA256 of the raw payload' },
      { value: 'md5_tx_reward_secret', label: 'MD5 of txid + reward + secret' },
      { value: 'sha256_uid_reward_secret', label: 'SHA-256 of uid + reward + secret' },
      { value: 'none', label: 'None — trust the request (IP allowlist only)' },
    ],
    hint: 'Must match the provider exactly. "none" credits on any request that reaches the route.',
  },
  { key: 'rating', label: 'Rating out of 5', kind: 'number', min: 0, max: 5, step: 0.1, defaultValue: 4.5 },
  {
    key: 'mark',
    label: 'Monogram',
    kind: 'text',
    defaultValue: 'OW',
    hint: 'Two or three letters for the card tile, since provider logos are not hosted here.',
  },
  {
    key: 'hue',
    label: 'Tile hue',
    kind: 'number',
    min: 0,
    max: 360,
    defaultValue: 160,
    hint: 'Degrees on the colour wheel, for the card tile only.',
  },
  { key: 'featured', label: 'Featured', kind: 'switch', defaultValue: false },
  { key: 'enabled', label: 'Enabled', kind: 'switch', defaultValue: true },
];

export default async function OfferwallModulePage() {
  const session = await requirePermission('earn.view');
  const allow = allowFor(session);

  const [providers, series, conversions, reversed] = await Promise.all([
    listCatalogue('offerwallProviders', 100),
    getDailySeries(30),
    countWhere('offerwallConversions'),
    countWhere('offerwallConversions', [['status', '==', 'Reversed']]),
  ]);

  const conversions30 = series.reduce((sum, row) => sum + row.offerwallConversions, 0);
  const live = providers.filter((p) => p.enabled);
  const unsigned = providers.filter((p) => p.fields['signatureMode'] === 'none');

  return (
    <ScaffoldPage
      perm="earn.view"
      title="Offerwall providers"
      sub={`${nf(live.length)} of ${nf(providers.length)} providers enabled`}
      kpis={[
        { label: 'Providers', value: nf(providers.length), sub: `${nf(live.length)} enabled` },
        { label: 'Conversions · 30d', value: compact(conversions30), sub: 'from the daily counters' },
        { label: 'Conversions ever', value: compact(conversions), sub: 'documents in /offerwallConversions' },
        {
          label: 'Reversed',
          value: nf(reversed),
          sub: reversed ? 'charged back by the advertiser' : 'none reversed',
          tone: reversed ? 'danger' : 'default',
        },
        {
          label: 'Unsigned postbacks',
          value: nf(unsigned.length),
          sub: unsigned.length ? 'crediting on unverified requests' : 'every provider is verified',
          tone: unsigned.length ? 'danger' : 'success',
        },
      ]}
    >
      {unsigned.length ? (
        <Alert tone="danger">
          <strong>
            {unsigned.length} provider{unsigned.length > 1 ? 's' : ''} set to signature mode “none”.
          </strong>{' '}
          Anything that can reach the postback route can mint tokens for any account. Only acceptable behind an
          IP allowlist you control, and never for long.
        </Alert>
      ) : null}

      <CatalogueEditor
        collection="offerwallProviders"
        noun="Provider"
        fields={PROVIDER_FIELDS}
        rows={providers}
        canEdit={allow('earn.provider')}
        titleKey="name"
        detailLabel="Postback URL to give the provider"
        detailTemplate={absoluteUrl('/api/offerwall/{id}')}
      />

      <Card as="section">
        <CardHead>
          <div>
            <CardTitle>Reversing a conversion</CardTitle>
            <CardSub>When an advertiser charges back after we have already credited</CardSub>
          </div>
        </CardHead>
        <CardBody className="text-13 leading-body text-text-3">
          <p>
            A reversal debits the member and marks the conversion Reversed. It is exposed as{' '}
            <code className="font-mono text-12">POST /api/admin/actions/offerwall-reverse</code> with a
            conversion id, and needs <code className="font-mono text-12">earn.recredit</code>. There is no
            list of conversions on this screen to click, because{' '}
            <code className="font-mono text-12">/offerwallConversions</code> is a per-member subcollection read
            — you reach a specific conversion from the member&apos;s own account page.
          </p>
          <p className="mt-2">
            A second reversal on the same conversion sees the Reversed status and returns without debiting
            twice.
          </p>
        </CardBody>
      </Card>
    </ScaffoldPage>
  );
}
