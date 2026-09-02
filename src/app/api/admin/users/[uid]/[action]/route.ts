import { AppError } from '@/server/db';
import { handler, ok, optionalString, requireNumber, requireString } from '@/server/http';
import { adjustBalance, suspendUser, unsuspendUser, writeAudit } from '@/server/admin';
import { PermissionDeniedError, requirePermission } from '@/lib/admin/guard';

/* ============================================================================
   POST /api/admin/users/[uid]/[action]
   ----------------------------------------------------------------------------
   One route for the three user-lifecycle actions, because they share their
   authorisation, their audit shape and their failure modes. Splitting them across
   three files would triple the boilerplate and give three places for the
   permission check to drift.

   Every action is permission-checked against the VERIFIED session and writes an
   audit row. A balance adjustment goes through the ledger like any other credit or
   debit, so it appears in the user's own transaction history — the difference
   between a correction and a mystery.
   ========================================================================== */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTIONS = new Set(['suspend', 'unsuspend', 'adjust']);

export const POST = handler<{ uid: string; action: string }>(async (ctx) => {
  const { uid, action } = ctx.params;

  if (!ACTIONS.has(action)) {
    throw new AppError(`Unknown action "${action}".`, 400, 'bad_action');
  }
  if (!uid || uid.length < 6) throw new AppError('Missing user id.', 400, 'bad_uid');

  const body = await ctx.body();

  try {
    if (action === 'suspend') {
      const session = await requirePermission('user.suspend', { mode: 'throw' });
      const reason = requireString(body, 'reason', 400);
      await suspendUser(uid, reason, session.uid, optionalString(body, 'until'));
      return ok({ ok: true, status: 'suspended' });
    }

    if (action === 'unsuspend') {
      const session = await requirePermission('user.suspend', { mode: 'throw' });
      await unsuspendUser(uid, session.uid);
      return ok({ ok: true, status: 'active' });
    }

    const session = await requirePermission('balance.adjust', { mode: 'throw' });
    const tokens = Math.trunc(requireNumber(body, 'tokens'));
    const reason = requireString(body, 'reason', 400);

    if (!tokens) throw new AppError('An adjustment of zero does nothing.', 400, 'zero_amount');

    /* A hard ceiling on a single manual adjustment. Not a permission — a typo
       guard. Six digits is enough for every legitimate correction, and an operator
       who genuinely needs more can make two. */
    if (Math.abs(tokens) > 1_000_000) {
      throw new AppError(
        'Single adjustments are capped at 1,000,000 tokens. Split it, or fix the underlying credit path.',
        400,
        'adjustment_too_large',
      );
    }

    const result = await adjustBalance({ uid, tokens, reason, actorUid: session.uid });
    return ok({ ok: true, balance: result.balance });
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      /* A refused attempt is itself interesting: repeated denials on
         `balance.adjust` are a signal, not noise. */
      await writeAudit({
        actorUid: 'unknown',
        action: `${error.perm}.denied`,
        target: uid,
        detail: `role ${error.role} attempted ${action}`,
      });
      throw new AppError(error.message, 403, 'forbidden');
    }
    throw error;
  }
});
