import { AppError } from '@/server/db';
import { handler, ok, optionalString } from '@/server/http';
import { deleteCatalogueItem, upsertCatalogueItem } from '@/server/admin';
import { PermissionDeniedError, requirePermission } from '@/lib/admin/guard';
import type { Permission } from '@/lib/admin/rbac';

/* ============================================================================
   POST   /api/admin/catalogue/[collection]        create or update an item
   DELETE /api/admin/catalogue/[collection]?id=…   remove one
   ----------------------------------------------------------------------------
   The five editable catalogues behind the earning surfaces. The collection name
   arrives in the URL, so it is WHITELISTED rather than validated by shape — an
   unchecked collection name in a path is a write primitive against any document in
   the database, including `/users` and `/config`.

   Each catalogue carries the permission of the module it belongs to, so somebody
   who can edit PTC campaigns cannot silently reprice shortlinks.

   A coupon's document id IS its code, upper-cased, which is what makes redemption
   a single read and stops two coupons sharing a code. That is enforced here rather
   than left to the caller.
   ========================================================================== */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CATALOGUES: Record<string, { perm: Permission; label: string; idFromCode?: boolean }> = {
  ptcAds: { perm: 'earn.edit', label: 'PTC campaign' },
  shortlinks: { perm: 'earn.edit', label: 'Shortlink' },
  offerwallProviders: { perm: 'earn.provider', label: 'Offerwall provider' },
  challenges: { perm: 'earn.edit', label: 'Challenge' },
  coupons: { perm: 'coupon.manage', label: 'Coupon', idFromCode: true },
};

const STRIP = new Set(['id', 'createdAt', 'updatedAt', 'updatedBy', 'redeemed', 'viewsDelivered']);

export const POST = handler<{ collection: string }>(async (ctx) => {
  const { collection } = ctx.params;
  const spec = CATALOGUES[collection];

  if (!spec) {
    throw new AppError(
      `"${collection}" is not an editable catalogue.`,
      400,
      'unknown_collection',
    );
  }

  try {
    const session = await requirePermission(spec.perm, { mode: 'throw' });
    const body = await ctx.body();

    let id = optionalString(body, 'id');

    if (spec.idFromCode) {
      const code = (optionalString(body, 'code') ?? id ?? '').toUpperCase();
      if (!/^[A-Z0-9_-]{3,32}$/.test(code)) {
        throw new AppError(
          'A coupon code is 3–32 characters: letters, numbers, underscore or hyphen.',
          400,
          'bad_code',
        );
      }
      id = code;
    }

    const fields = Object.fromEntries(
      Object.entries(body).filter(([key, value]) => !STRIP.has(key) && value !== undefined),
    );

    if (!Object.keys(fields).length) throw new AppError('Nothing to save.', 400, 'empty');

    const savedId = await upsertCatalogueItem(collection, id, fields, session.uid);
    return ok({ ok: true, id: savedId, label: spec.label });
  } catch (error) {
    if (error instanceof PermissionDeniedError) throw new AppError(error.message, 403, 'forbidden');
    throw error;
  }
});

export const DELETE = handler<{ collection: string }>(async (ctx) => {
  const { collection } = ctx.params;
  const spec = CATALOGUES[collection];
  if (!spec) throw new AppError(`"${collection}" is not an editable catalogue.`, 400, 'unknown_collection');

  const id = ctx.query('id');
  if (!id) throw new AppError('Missing id.', 400, 'missing_id');

  try {
    const session = await requirePermission(spec.perm, { mode: 'throw' });
    await deleteCatalogueItem(collection, id, session.uid);
    return ok({ ok: true, id });
  } catch (error) {
    if (error instanceof PermissionDeniedError) throw new AppError(error.message, 403, 'forbidden');
    throw error;
  }
});
