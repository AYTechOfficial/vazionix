import type { Metadata } from 'next';

import { brand } from '@/lib/brand';
import { requirePermission } from '@/lib/admin/guard';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';

export const metadata: Metadata = { title: 'Social links' };

/* ============================================================================
   /admin/content/social — the channels the product links to
   ----------------------------------------------------------------------------
   These are environment variables read through `src/lib/brand.ts`, not database
   records, and that is deliberate: a social URL appears in the footer of every page,
   so resolving it from a document would add a Firestore read to every render for a
   value that changes once a year.

   The consequence is that editing them is a deploy-time change, and this screen says
   which variable to set rather than offering a form that cannot work. A missing
   variable is not an error — an unset Discord URL simply hides the link.
   ========================================================================== */

export const dynamic = 'force-dynamic';

export default async function SocialPage() {
  await requirePermission('content.edit');

  const channels: Array<{ label: string; value: string; env: string }> = [
    { label: 'X (Twitter)', value: brand.social.x, env: 'NEXT_PUBLIC_SOCIAL_X' },
    { label: 'Telegram', value: brand.social.telegram, env: 'NEXT_PUBLIC_SOCIAL_TELEGRAM' },
    { label: 'Discord', value: brand.social.discord, env: 'NEXT_PUBLIC_SOCIAL_DISCORD' },
    { label: 'Support email', value: brand.email.support, env: 'NEXT_PUBLIC_SUPPORT_EMAIL' },
    { label: 'No-reply email', value: brand.email.noreply, env: 'NEXT_PUBLIC_NOREPLY_EMAIL' },
  ];

  const set = channels.filter((c) => c.value.trim()).length;

  return (
    <ScaffoldPage
      perm="content.edit"
      title="Social links"
      sub={`${set} of ${channels.length} channels configured · set through the environment, not the database`}
      kpis={[
        { label: 'Configured', value: `${set} / ${channels.length}`, sub: 'non-empty environment values' },
        { label: 'Storage', value: 'Environment', sub: 'read via src/lib/brand.ts' },
        { label: 'Click tracking', value: 'None', sub: 'no outbound click events are recorded' },
      ]}
    >
      <Card as="section">
        <CardHead>
          <div>
            <CardTitle>Channels</CardTitle>
            <CardSub>An empty value hides the link rather than rendering a dead one</CardSub>
          </div>
        </CardHead>
        <div className="w-full overflow-auto">
          <table className="vf-table">
            <caption className="sr-only">Social channels, their current values and the variables that set them</caption>
            <thead>
              <tr>
                <th scope="col">Channel</th>
                <th scope="col">Current value</th>
                <th scope="col">Environment variable</th>
                <th scope="col">State</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((channel) => (
                <tr key={channel.env}>
                  <td className="text-text-2">{channel.label}</td>
                  <td className="max-w-[320px] truncate font-mono text-12">
                    {channel.value.trim() || '—'}
                  </td>
                  <td className="font-mono text-11 text-text-3">{channel.env}</td>
                  <td>
                    {channel.value.trim() ? (
                      <Pill tone="success">set</Pill>
                    ) : (
                      <Pill tone="neutral">unset</Pill>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <CardBody className="border-t border-line text-12 leading-body text-text-3">
          Every user-visible occurrence of the product name, domain, support address and social handle resolves
          through <code className="font-mono">src/lib/brand.ts</code>. Nothing else hardcodes them, so a rename
          is one edit plus the logo mark.
        </CardBody>
      </Card>
    </ScaffoldPage>
  );
}
