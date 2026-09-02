import { AppError } from '@/server/db';
import { handler, ok, requireString } from '@/server/http';
import { approveWithdrawal, rejectWithdrawal, settleWithdrawal } from '@/server/payouts';
import { PermissionDeniedError, requirePermission } from '@/lib/admin/guard';

/* ============================================================================
   POST /api/admin/payouts/[id]/[action]   action = approve | reject | settle
   ----------------------------------------------------------------------------
   The three operator decisions on a queued withdrawal.

   APPROVE claims the withdrawal by setting it Processing inside a transaction
   BEFORE calling the payment provider, so two operators clicking Approve at the
   same moment cannot both send. If the provider's answer is ambiguous — a timeout,
   an unrecognised body — the withdrawal stays Processing with the tokens locked and
   the reason surfaced. It never marks Completed on uncertainty: paying twice is
   unrecoverable, paying late is a support reply.

   SETTLE exists for Direct on-chain payouts, which are broadcast from custody
   tooling rather than from this process. Signing keys do not belong in a web
   server, so the operator records the txid here once the transaction is out.
   ========================================================================== */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handler<{ id: string; action: string }>(async (ctx) => {
  const { id, action } = ctx.params;
  if (!id) throw new AppError('Missing withdrawal id.', 400, 'bad_id');

  const body = await ctx.body();

  try {
    if (action === 'approve') {
      const session = await requirePermission('withdrawal.approve', { mode: 'throw' });
      const result = await approveWithdrawal(id, session.uid);
      return ok({ ok: true, ...result });
    }

    if (action === 'reject') {
      const session = await requirePermission('withdrawal.approve', { mode: 'throw' });
      const reason = requireString(body, 'reason', 400);
      await rejectWithdrawal(id, session.uid, reason);
      return ok({ ok: true, status: 'Rejected' });
    }

    if (action === 'settle') {
      const session = await requirePermission('withdrawal.approve', { mode: 'throw' });
      const txid = requireString(body, 'txid', 200);
      await settleWithdrawal(id, txid, session.uid);
      return ok({ ok: true, status: 'Completed', txid });
    }

    throw new AppError(`Unknown action "${action}".`, 400, 'bad_action');
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      throw new AppError(error.message, 403, 'forbidden');
    }
    throw error;
  }
});
