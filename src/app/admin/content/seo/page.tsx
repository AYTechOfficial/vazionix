import type { Metadata } from 'next';

import { brand } from '@/lib/brand';
import { requirePermission } from '@/lib/admin/guard';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { NotConfigured } from '@/components/admin/NotConfigured';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';

export const metadata: Metadata = { title: 'SEO' };

/* ============================================================================
   /admin/content/seo — where page metadata actually comes from
   ----------------------------------------------------------------------------
   Nothing on this screen is editable, and pretending otherwise would be the mistake.
   Titles, descriptions and the OpenGraph card are produced by Next's Metadata API:
   a `metadata` export per route, resolved at build or render time from
   `src/lib/brand.ts`. There is no `/config/seo` document and the config write route
   whitelists only economy, rates, ads and site — so a form here would post to an
   endpoint that refuses it.

   What this screen does is state the values in force and where each one lives, so
   nobody has to grep for the source of a wrong title.
   ========================================================================== */

export const dynamic = 'force-dynamic';

export default async function SeoPage() {
  await requirePermission('seo.edit');

  const rows: Array<[string, string, string]> = [
    ['Site name', brand.name, 'src/lib/brand.ts → brand.name'],
    ['Title template', `%s · ${brand.name}`, 'src/app/layout.tsx → metadata.title.template'],
    ['Tagline', brand.tagline, 'src/lib/brand.ts → brand.tagline'],
    ['Description', brand.description, 'src/lib/brand.ts → brand.description'],
    ['Canonical origin', brand.url, 'NEXT_PUBLIC_SITE_URL'],
    ['Host shown to members', brand.domain, 'derived from NEXT_PUBLIC_SITE_URL'],
    ['Support address', brand.email.support, 'NEXT_PUBLIC_SUPPORT_EMAIL'],
    ['Admin indexing', 'noindex, nofollow', 'src/app/admin/layout.tsx → metadata.robots'],
  ];

  return (
    <ScaffoldPage
      perm="seo.edit"
      title="SEO"
      sub="Read-only: metadata is code and environment, not a database document"
      kpis={[
        { label: 'Canonical origin', value: brand.domain, sub: 'from NEXT_PUBLIC_SITE_URL' },
        { label: 'Editable here', value: 'Nothing', sub: 'no /config/seo document exists' },
        { label: 'Admin routes', value: 'noindex', sub: 'staff console is excluded from search' },
      ]}
    >
      <Card as="section">
        <CardHead>
          <div>
            <CardTitle>Metadata in force</CardTitle>
            <CardSub>And the exact place each value is set</CardSub>
          </div>
        </CardHead>
        <div className="w-full overflow-auto">
          <table className="vf-table">
            <caption className="sr-only">Current SEO metadata values and their sources</caption>
            <thead>
              <tr>
                <th scope="col">Field</th>
                <th scope="col">Value</th>
                <th scope="col">Set in</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([field, value, source]) => (
                <tr key={field}>
                  <td className="text-text-2">{field}</td>
                  <td className="max-w-[380px] text-text">{value}</td>
                  <td className="font-mono text-11 text-text-3">{source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <CardBody className="border-t border-line text-12 leading-body text-text-3">
          Per-page titles come from each route&apos;s own <code className="font-mono">metadata</code> export.
          Changing one is a code edit and a deploy, which for a title is the right trade — a metadata document
          read on every render would add a Firestore read to every page in the product.
        </CardBody>
      </Card>

      <NotConfigured
        what="Editable SEO overrides"
        collection="/config/seo"
        how="No such document is read by anything, and the config write route accepts only economy, rates, ads and site. Making titles editable means adding a section to that whitelist and a reader in the layout — not a form on this screen."
      />
    </ScaffoldPage>
  );
}
