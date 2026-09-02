import { handler, ok } from '@/server/http';
import { requireUser } from '@/server/session';
import { listNotifications, markNotificationsRead } from '@/server/users';

/* ============================================================================
   GET  /api/notifications — newest 20
   POST /api/notifications — mark every unread one read
   ========================================================================== */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  const claims = await requireUser();
  return ok({ notifications: await listNotifications(claims.uid, 20) });
});

export const POST = handler(async () => {
  const claims = await requireUser();
  await markNotificationsRead(claims.uid);
  return ok({ ok: true, notifications: await listNotifications(claims.uid, 20) });
});
