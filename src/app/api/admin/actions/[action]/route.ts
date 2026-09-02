import { AppError } from '@/server/db';
import { handler, ok } from '@/server/http';
import { drawLottery } from '@/server/earn/lottery';
import { reverseConversion } from '@/server/earn/offerwall';
import { PermissionDeniedError, requirePermission } from '@/lib/admin/guard';

/* ============================================================================
   POST /api/admin/actions/[action]
   ----------------------------------------------------------------------------
   The one-off operator actions that do not belong to a resource route:

     lottery-draw      run the weekly draw now instead of waiting for the schedule
     offerwall-reverse claw back a conversion an advertiser charged back

   Both are idempotent at the layer below. A second draw on a closed round finds no
   Pending tickets and does nothing; a second reversal sees the Reversed status and
   returns. That matters because the obvious operator response to a slow response is
   to click again.
   ========================================================================== */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handler<{ action: string }>(async (ctx) => {
  const { action } = ctx.params;
  const body = await ctx.body();

  try {
    if (action === 'lottery-draw') {
      const session = await requirePermission('lottery.draw', { mode: 'throw' });
      const result = await drawLottery(session.uid);
      return ok({ ok: true, ...result });
    }

    if (action === 'offerwall-reverse') {
      const session = await requirePermission('earn.recredit', { mode: 'throw' });
      const conversionId = typeof body.conversionId === 'string' ? body.conversionId : '';
      if (!conversionId) throw new AppError('Missing conversion id.', 400, 'missing_id');
      await reverseConversion(conversionId, session.uid);
      return ok({ ok: true, conversionId });
    }

    throw new AppError(`Unknown action "${action}".`, 400, 'bad_action');
  } catch (error) {
    if (error instanceof PermissionDeniedError) throw new AppError(error.message, 403, 'forbidden');
    throw error;
  }
});
