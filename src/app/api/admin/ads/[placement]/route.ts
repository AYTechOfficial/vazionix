import type { AdUnitKind } from '@/lib/ads/config';
import { PLACEMENT_BY_ID } from '@/lib/ads/placements';
import { AD_FORMATS, type AdFormatId } from '@/lib/ads/formats';

import { AppError } from '@/server/db';
import { handler, ok, optionalString } from '@/server/http';
import { deleteAdUnit, saveAdUnit } from '@/server/admin';
import { PermissionDeniedError, requirePermission } from '@/lib/admin/guard';

/* ============================================================================
   POST   /api/admin/ads/[placement]   save or update a unit
   DELETE /api/admin/ads/[placement]   unfill the slot
   ----------------------------------------------------------------------------
   `/adUnits/{placementId}` is EXECUTABLE CONTENT: its `html` is injected into a
   sandboxed iframe and its `src` is loaded as a script. That is why this route
   requires `ads.inventory` and why firestore.rules denies client writes to the
   collection outright — the only path to it is an authenticated staff request.

   The placement id is validated against the placement map rather than accepted as
   free text. An arbitrary id would create a document no renderer reads, which
   looks like a broken save and is impossible to debug from the UI.

   Nothing here sanitises the snippet, and that is deliberate. Every ad network on
   earth ships `document.write`-era markup, so an ad system that refuses raw HTML
   cannot serve ads. The control is the sandbox in `AdUnit.tsx`, which withholds
   `allow-same-origin` so the tag cannot read the session cookie or reach the parent
   DOM — plus this permission gate, which decides who may paste one.
   ========================================================================== */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KINDS: AdUnitKind[] = ['html', 'script', 'container', 'url'];

export const POST = handler<{ placement: string }>(async (ctx) => {
  const { placement } = ctx.params;

  if (!PLACEMENT_BY_ID[placement]) {
    throw new AppError(
      `"${placement}" is not a known placement. Pick one from the inventory table.`,
      400,
      'unknown_placement',
    );
  }

  try {
    const session = await requirePermission('ads.edit', { mode: 'throw' });
    const body = await ctx.body();

    const kind = (optionalString(body, 'kind') ?? 'html') as AdUnitKind;
    if (!KINDS.includes(kind)) throw new AppError(`Unknown unit kind "${kind}".`, 400, 'bad_kind');

    const html = optionalString(body, 'html');
    const src = optionalString(body, 'src');
    const containerId = optionalString(body, 'containerId');
    const url = optionalString(body, 'url');
    const format = optionalString(body, 'format') as AdFormatId | null;

    if (format && !AD_FORMATS[format]) {
      throw new AppError(`Unknown format "${format}".`, 400, 'bad_format');
    }

    /* A unit with no payload renders as an unfilled placeholder, which looks like
       a failed save. Refuse it here with the specific missing field named. */
    const missing =
      (kind === 'html' && !html) ||
      (kind === 'script' && !src) ||
      (kind === 'container' && (!src || !containerId)) ||
      (kind === 'url' && !url);

    if (missing && body.enabled !== false) {
      throw new AppError(
        kind === 'html'
          ? 'Paste the network snippet into the HTML field.'
          : kind === 'script'
            ? 'A script unit needs the loader URL.'
            : kind === 'container'
              ? 'A container unit needs both the loader URL and the div id it targets.'
              : 'A link unit needs a destination URL.',
        400,
        'missing_payload',
      );
    }

    await saveAdUnit(
      placement,
      {
        kind,
        enabled: body.enabled !== false,
        ...(format ? { format } : {}),
        ...(html ? { html } : {}),
        ...(src ? { src } : {}),
        ...(containerId ? { containerId } : {}),
        ...(url ? { url } : {}),
        ...(optionalString(body, 'network') ? { network: optionalString(body, 'network') } : {}),
        capPerSession: Number(body.capPerSession) || 0,
        geo: Array.isArray(body.geo)
          ? (body.geo as unknown[])
              .filter((g): g is string => typeof g === 'string' && g.length === 2)
              .map((g) => g.toUpperCase())
              .slice(0, 40)
          : [],
      },
      session.uid,
    );

    return ok({ ok: true, placement });
  } catch (error) {
    if (error instanceof PermissionDeniedError) throw new AppError(error.message, 403, 'forbidden');
    throw error;
  }
});

export const DELETE = handler<{ placement: string }>(async (ctx) => {
  const { placement } = ctx.params;
  if (!PLACEMENT_BY_ID[placement]) {
    throw new AppError(`"${placement}" is not a known placement.`, 400, 'unknown_placement');
  }

  try {
    const session = await requirePermission('ads.edit', { mode: 'throw' });
    await deleteAdUnit(placement, session.uid);
    return ok({ ok: true, placement });
  } catch (error) {
    if (error instanceof PermissionDeniedError) throw new AppError(error.message, 403, 'forbidden');
    throw error;
  }
});
