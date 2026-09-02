import type { Metadata } from 'next';

import { nf } from '@/lib/format';
import { allowFor, requirePermission } from '@/lib/admin/guard';
import { AD_FORMATS } from '@/lib/ads/formats';
import { INVENTORY_COUNT, placementsByPage } from '@/lib/ads/placements';
import { listAdUnits } from '@/server/admin';
import { getAdConfig } from '@/server/config';
import { PageHeader } from '@/components/shell/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';
import { KpiBand } from '@/components/admin/KpiBand';
import { AdInventoryEditor, type InventoryRow } from '@/components/admin/AdInventoryEditor';

export const metadata: Metadata = { title: 'Ad inventory' };

/* ============================================================================
   /admin/ads/inventory — where the site is monetised
   ----------------------------------------------------------------------------
   Advertising is this product's primary revenue, so this is the screen that
   matters most in the console. It joins the static placement map against
   `/adUnits` and shows every reserved position, filled or not.

   THE JOIN DIRECTION IS THE WHOLE DESIGN
   `placementsByPage()` is the left side; the documents are looked up per row. An
   inventory table built from the documents could only list what is already filled,
   which is the opposite of the job — the empty rows are the work, and
   "filled / total" is the number that says how much of the site earns anything.

   Dimensions come from `formatDimensions()` rather than being typed here, because
   an unfilled slot must reserve the exact box the filled slot will occupy. If it
   does not, pasting a live tag reflows the page and the first impression of every
   session renders into a box that is still resizing — which some networks score as
   a viewability failure and pay less for.
   ========================================================================== */

export const dynamic = 'force-dynamic';

export default async function AdInventoryPage() {
  const session = await requirePermission('ads.view');
  const allow = allowFor(session);

  const [units, adConfig] = await Promise.all([listAdUnits(), getAdConfig()]);

  const byId = new Map(units.map((u) => [u.placement, u]));

  const rows: InventoryRow[] = placementsByPage().flatMap((group) =>
    group.items.map((placement) => {
      const unit = byId.get(placement.id);
      return {
        placement: placement.id,
        page: group.page,
        position: placement.position,
        format: placement.format,
        mobileFormat: placement.mobileFormat,
        note: placement.note,
        unit: unit
          ? {
              kind: unit.kind,
              network: unit.network,
              enabled: unit.enabled,
              hasPayload: unit.hasPayload,
              capPerSession: unit.capPerSession,
              updatedAt: unit.updatedAt,
            }
          : null,
      };
    }),
  );

  const live = rows.filter((r) => r.unit?.hasPayload && r.unit.enabled);
  const halfDone = rows.filter((r) => r.unit && !r.unit.hasPayload);
  const disabled = rows.filter((r) => r.unit?.hasPayload && !r.unit.enabled);
  const overlays = rows.filter((r) => AD_FORMATS[r.format].kind === 'overlay');
  const networks = [...new Set(live.map((r) => r.unit?.network).filter((n): n is string => Boolean(n) && n !== '—'))];

  return (
    <>
      <PageHeader
        title="Ad inventory"
        sub={`${nf(live.length)} of ${nf(INVENTORY_COUNT)} placements are filled and enabled`}
      />

      <KpiBand
        className="mb-5"
        items={[
          {
            label: 'Filled',
            value: `${nf(live.length)} / ${nf(INVENTORY_COUNT)}`,
            sub: live.length ? 'carrying a payload and enabled' : 'nothing is earning yet',
            tone: live.length ? 'success' : 'danger',
          },
          {
            label: 'Half-configured',
            value: nf(halfDone.length),
            sub: 'document exists with no snippet — renders a placeholder',
            tone: halfDone.length ? 'danger' : 'default',
          },
          {
            label: 'Disabled',
            value: nf(disabled.length),
            sub: 'tag kept, slot blanked',
          },
          {
            label: 'Networks in use',
            value: networks.length ? String(networks.length) : '0',
            sub: networks.join(', ') || 'no network label recorded',
          },
          {
            label: 'Master switch',
            value: adConfig.behaviour.enabled ? 'On' : 'Off',
            sub: adConfig.behaviour.enabled ? 'ads render site-wide' : 'every slot is blank',
            tone: adConfig.behaviour.enabled ? 'default' : 'danger',
          },
        ]}
      />

      {!adConfig.behaviour.enabled ? (
        <Alert tone="danger" className="mb-5">
          <strong>The master ad switch is off.</strong> Every slot renders blank whatever is configured here.
          Turn it back on in <code className="font-mono text-12">/config/ads</code>.
        </Alert>
      ) : null}

      {!live.length ? (
        <Alert tone="warning" className="mb-5">
          <strong>No unit is filled.</strong> Every placement below renders a dimension-labelled placeholder.
          Pick a row, choose the kind that matches what your network gave you, paste it, save — the slot goes
          live on the next render with no deploy.
        </Alert>
      ) : null}

      <Card as="section" className="mb-5">
        <CardHead>
          <div>
            <CardTitle>How a tag reaches a slot</CardTitle>
            <CardSub>Firestore beats environment beats the committed fallback</CardSub>
          </div>
        </CardHead>
        <CardBody className="grid gap-3 text-12 leading-body text-text-3 md:grid-cols-3">
          <p>
            <strong className="text-text-2">Adsterra banner or native.</strong> Two script tags — an{' '}
            <code className="font-mono">atOptions</code> object and an{' '}
            <code className="font-mono">invoke.js</code> loader. Kind{' '}
            <strong className="text-text-2">HTML snippet</strong>, pasted whole and unedited.
          </p>
          <p>
            <strong className="text-text-2">Social bar, popunder, in-page push.</strong> One loader URL and no
            container; the network positions the unit. Kind{' '}
            <strong className="text-text-2">Script loader</strong>. {nf(overlays.length)} overlay placements
            exist for these.
          </p>
          <p>
            <strong className="text-text-2">AdsLab container zones and AdSense.</strong> A loader plus the div
            id it fills. Kind <strong className="text-text-2">Container + loader</strong> — the id must match
            exactly or the script finds nothing and reports nothing.
          </p>
        </CardBody>
      </Card>

      <div className="mb-5 flex flex-wrap items-center gap-2 text-11 text-text-3">
        <Pill tone="neutral">Sandboxed</Pill>
        Snippets are injected into an iframe without{' '}
        <code className="font-mono">allow-same-origin</code>, so a network script cannot read the session
        cookie or walk the page. That sandbox is why raw HTML is accepted here and nowhere else, and why only{' '}
        <code className="font-mono">ads.edit</code> may write these documents.
      </div>

      <AdInventoryEditor rows={rows} canEdit={allow('ads.edit')} />
    </>
  );
}
