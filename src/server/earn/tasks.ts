import 'server-only';

import { randomBytes } from 'node:crypto';

import { AppError, badRequest, int, num, tooMany } from '../db';
import {
  supabaseConsumeTaskSession,
  supabaseGetTaskSession,
  supabaseOpenTaskSession,
  supabaseSetTaskCooldown,
  supabaseTaskCooldown,
  supabaseTaskCooldowns,
} from '../data-supabase';

/* ============================================================================
   TIMED TASKS — the shared mechanic behind PTC and shortlinks
   ----------------------------------------------------------------------------
   Both formats pay for ATTENTION: the user must stay on a destination for N
   seconds. The only honest way to measure that is server-side, so both share
   this two-call protocol:

     START     issues a single-use session token, records `startedAt` on the
               server, and returns the destination.
     COMPLETE  presented with the token, checks that `now - startedAt >= N`,
               marks the token spent, and credits.

   WHAT THIS DEFEATS
   • Replay — the token is deleted on completion, so it pays once.
   • Fast-forward — the elapsed time is measured between two server timestamps.
     A client clock, a paused JS timer or a forged "I waited" flag cannot move it.
   • Parallel farming — one open session per item per user; starting again
     replaces the old token rather than adding a second.
   • Cooldown evasion — the per-item cooldown is written with the credit, in the
     same call, so there is no window where a claim landed and the cooldown did
     not.

   WHAT IT DOES NOT DEFEAT
   Someone who opens the destination and walks away still gets paid. That is the
   advertiser's problem to price, not ours to police, and every network in this
   space works the same way.
   ========================================================================== */

export type TaskKind = 'ptc' | 'shortlink';

export interface TaskSession {
  token: string;
  kind: TaskKind;
  itemId: string;
  requiredSeconds: number;
  startedAt: string;
  expiresAt: string;
}

const newToken = () => randomBytes(18).toString('base64url');

/** Cooldown key for one catalogue item. */
export const cooldownKey = (kind: TaskKind, itemId: string) => `${kind}_${itemId}`;

export async function assertNotCoolingDown(uid: string, kind: TaskKind, itemId: string): Promise<void> {
  const row = await supabaseTaskCooldown(uid, cooldownKey(kind, itemId));
  const nextAt = row?.next_at ? new Date(row.next_at as string).toISOString() : null;

  const ms = nextAt ? Date.parse(nextAt) : 0;
  if (ms > Date.now()) {
    const seconds = Math.ceil((ms - Date.now()) / 1000);
    throw tooMany(`Already completed. Available again in ${humanWait(seconds)}.`, 'cooldown');
  }
}

/** ISO of when each of `itemIds` becomes available again for this user. */
export async function cooldownMap(
  uid: string,
  kind: TaskKind,
  itemIds: string[],
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  if (!itemIds.length) return out;

  const byItem = new Map<string, string | null>();

  /* One query over the user's cooldown rows beats N single-row reads: the
     catalogue is dozens of items and a page render must not fan out. */
  const rows = await supabaseTaskCooldowns(uid, kind);
  for (const row of rows) {
    const at = row.next_at ? new Date(row.next_at as string).toISOString() : null;
    byItem.set(String(row.item_id ?? ''), at);
  }

  for (const id of itemIds) {
    const at = byItem.get(id) ?? null;
    out[id] = at && Date.parse(at) > Date.now() ? at : null;
  }
  return out;
}

export async function openTaskSession(args: {
  uid: string;
  kind: TaskKind;
  itemId: string;
  requiredSeconds: number;
  ttlSeconds?: number;
}): Promise<TaskSession> {
  const required = Math.max(1, Math.floor(args.requiredSeconds));
  const ttl = Math.max(required + 120, args.ttlSeconds ?? required + 900);
  const token = newToken();
  const startedAt = new Date();
  const expiresAt = new Date(startedAt.getTime() + ttl * 1000);

  /* The delete-then-insert inside this helper is what stops two tabs both
     holding an open session for the same item — starting again replaces the
     old token rather than adding a second. */
  await supabaseOpenTaskSession({
    token,
    userId: args.uid,
    kind: args.kind,
    itemId: args.itemId,
    requiredSeconds: required,
    startedAt,
    expiresAt,
  });

  return {
    token,
    kind: args.kind,
    itemId: args.itemId,
    requiredSeconds: required,
    startedAt: startedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

export interface ClosedSession {
  itemId: string;
  requiredSeconds: number;
  elapsedSeconds: number;
}

/**
 * Validate and consume a session token. Deleting it as the last step (and only
 * crediting when THIS call was the one that removed it) is what makes
 * completion single-use — a second call finds nothing and fails.
 */
export async function closeTaskSession(args: {
  uid: string;
  kind: TaskKind;
  token: string;
  /** Seconds of slack for network latency and a throttled background tab. */
  graceSeconds?: number;
}): Promise<ClosedSession> {
  if (!args.token || args.token.length < 10) throw badRequest('Missing task token.', 'bad_token');

  const row = await supabaseGetTaskSession(args.uid, args.token);
  if (!row) {
    throw badRequest('That task session is not open. Start the task again.', 'session_missing');
  }
  if (String(row.kind) !== args.kind) throw badRequest('Task type mismatch.', 'bad_token');

  const startedMs = Date.parse(String(row.started_at));
  const expiresMs = Date.parse(String(row.expires_at));
  const required = int(row.required_seconds, 1);
  const elapsed = Math.floor((Date.now() - startedMs) / 1000);

  if (Number.isFinite(expiresMs) && Date.now() > expiresMs) {
    await supabaseConsumeTaskSession(args.uid, args.token);
    throw badRequest('That task expired. Start it again.', 'session_expired');
  }

  const grace = Math.max(0, args.graceSeconds ?? 2);
  if (elapsed + grace < required) {
    throw badRequest(
      `Stay on the page for the full ${required} seconds — ${required - elapsed}s left.`,
      'too_fast',
    );
  }

  /* Consume LAST, and only credit if this call is the one that removed the
     token. Two simultaneous completions therefore pay exactly once. */
  const consumed = await supabaseConsumeTaskSession(args.uid, args.token);
  if (!consumed) {
    throw badRequest('That task session is not open. Start the task again.', 'session_missing');
  }

  return { itemId: String(row.item_id ?? ''), requiredSeconds: required, elapsedSeconds: elapsed };
}

/** Write the per-item cooldown after a successful credit. */
export async function setCooldown(
  uid: string,
  kind: TaskKind,
  itemId: string,
  hours: number,
): Promise<string> {
  const nextAt = new Date(Date.now() + Math.max(0, num(hours, 24)) * 3600 * 1000);
  await supabaseSetTaskCooldown(uid, cooldownKey(kind, itemId), kind, itemId, nextAt);
  return nextAt.toISOString();
}

export function humanWait(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/** Guard used by both engines before a catalogue item is served. */
export function assertItemUsable(item: { enabled?: boolean; targetUrl?: string } | null, what: string): void {
  if (!item) throw new AppError(`${what} not found.`, 404, 'not_found');
  if (item.enabled === false) throw badRequest(`${what} is no longer available.`, 'disabled');
  if (!item.targetUrl) throw badRequest(`${what} has no destination configured.`, 'misconfigured');
}
