import type { Permission } from '@/lib/admin/rbac';

import { AppError } from '@/server/db';
import { handler, ok } from '@/server/http';
import { saveConfig } from '@/server/admin';
import { PermissionDeniedError, requirePermission } from '@/lib/admin/guard';

/* ============================================================================
   POST /api/admin/config/[section]   section = economy | rates | ads | site
   ----------------------------------------------------------------------------
   The four documents that drive the whole product. A partial patch is merged over
   what is there, and what is there is merged over the shipped defaults in
   `src/lib/config/economy.ts` — so an operator can change one reward without
   restating the entire economy, and a fresh project runs on defaults until
   somebody touches it.

   Each section carries its own permission. Rates and the economy move money;
   `site` is the kill switch; `ads` is behaviour only. Giving them one shared
   permission would mean anybody who can pause the site can also reprice a payout.
   ========================================================================== */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SECTIONS: Record<string, Permission> = {
  economy: 'earn.edit',
  rates: 'rates.edit',
  ads: 'ads.edit',
  site: 'maintenance.toggle',
};

/** Keys a client may never set through this route, whatever the section. */
const FORBIDDEN_KEYS = new Set(['updatedAt', 'updatedBy', 'createdAt']);

export const POST = handler<{ section: string }>(async (ctx) => {
  const { section } = ctx.params;
  const perm = SECTIONS[section];

  if (!perm) {
    throw new AppError(
      `"${section}" is not a config section. Use economy, rates, ads or site.`,
      400,
      'unknown_section',
    );
  }

  try {
    const session = await requirePermission(perm, { mode: 'throw' });
    const body = await ctx.body();

    const patch = Object.fromEntries(
      Object.entries(body).filter(([key, value]) => !FORBIDDEN_KEYS.has(key) && value !== undefined),
    );

    if (!Object.keys(patch).length) {
      throw new AppError('Nothing to save.', 400, 'empty_patch');
    }

    await saveConfig(section as 'economy' | 'rates' | 'ads' | 'site', patch, session.uid);
    return ok({ ok: true, section, keys: Object.keys(patch) });
  } catch (error) {
    if (error instanceof PermissionDeniedError) throw new AppError(error.message, 403, 'forbidden');
    throw error;
  }
});
