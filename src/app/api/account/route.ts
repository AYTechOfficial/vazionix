import type { CoinTicker } from '@/lib/models';

import { AppError } from '@/server/db';
import { handler, ok, optionalString, requireString } from '@/server/http';
import { requireUser } from '@/server/session';
import { changeUsername, getProfile, updateProfileFields } from '@/server/users';

/* ============================================================================
   GET   /api/account — the viewer's profile read model
   PATCH /api/account — country, display currency, notification preferences
   POST  /api/account — { action: 'username' } rename
   ----------------------------------------------------------------------------
   Deliberately narrow. Everything a user may change about themselves is in this
   list, and it contains nothing that decides what they earn — balance, level,
   bonus and referral tier are server-owned and are not writable from here or
   from firestore.rules.
   ========================================================================== */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  const claims = await requireUser();
  return ok({ profile: await getProfile(claims.uid, claims.emailVerified) });
});

export const PATCH = handler(async (ctx) => {
  const claims = await requireUser();
  const body = await ctx.body();

  const prefs =
    body.notificationPrefs && typeof body.notificationPrefs === 'object'
      ? (Object.fromEntries(
          Object.entries(body.notificationPrefs as Record<string, unknown>)
            .filter(([, v]) => typeof v === 'boolean')
            .slice(0, 20),
        ) as Record<string, boolean>)
      : undefined;

  await updateProfileFields(claims.uid, {
    ...(optionalString(body, 'countryCode') ? { countryCode: optionalString(body, 'countryCode')! } : {}),
    ...(optionalString(body, 'displayCurrency')
      ? { displayCurrency: optionalString(body, 'displayCurrency') as CoinTicker }
      : {}),
    ...(prefs ? { notificationPrefs: prefs } : {}),
  });

  return ok({ ok: true, profile: await getProfile(claims.uid, claims.emailVerified) });
});

export const POST = handler(async (ctx) => {
  const claims = await requireUser();
  const body = await ctx.body();
  const action = requireString(body, 'action', 20);

  if (action !== 'username') throw new AppError(`Unknown action "${action}".`, 400, 'bad_action');

  await changeUsername(claims.uid, requireString(body, 'username', 40));
  return ok({ ok: true, profile: await getProfile(claims.uid, claims.emailVerified) });
});
