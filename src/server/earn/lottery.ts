import 'server-only';

import { randomUUID } from 'node:crypto';

import type { LotteryState, LotteryTicket } from '@/lib/models';

import { getEconomy, getSiteConfig } from '../config';
import { isSupabaseBackend } from '@/lib/backend';
import {
  AppError,
  FieldValue,
  bool,
  db,
  int,
  iso,
  isoOr,
  isServerFirebaseReady,
  nextUtcWeekday,
  now,
  str,
} from '../db';
import { credit, debit } from '../ledger';
import { pushNotification } from '../users';

/* ============================================================================
   LOTTERY
   ----------------------------------------------------------------------------
   Tokens in, tokens out, with the pool visible. A round is a document and each
   ticket is a document under it, which matters for two reasons: the ticket count
   is a real count rather than a counter that can drift, and the draw can be
   reproduced from the stored tickets after the fact if a user disputes it.

   THE DRAW IS COMMIT-REVEAL
   `drawLottery` writes a hashed seed BEFORE selecting winners and publishes the
   plaintext seed with the result. Anyone can re-run the selection and check it.
   Without that, "we drew randomly" is unfalsifiable, and on a payouts product
   that is the same as "we picked our friends".
   ========================================================================== */

const ROUND = 'lottery/current';

interface RoundData {
  round: string;
  pool: number;
  totalTickets: number;
  drawsAt: string;
  closed: boolean;
}

async function readRound(): Promise<RoundData> {
  const economy = await getEconomy();
  const cfg = economy.lottery;
  const drawsAt = nextUtcWeekday(cfg.drawDayUtc, cfg.drawHourUtc).toISOString();

  if (isSupabaseBackend) {
    const { supabaseGetLotteryRound, supabaseUpsertLotteryRound } = await import('../data-supabase');
    const row = await supabaseGetLotteryRound('r1');
    if (!row) {
      await supabaseUpsertLotteryRound({
        id: 'r1',
        pool: cfg.seedPool,
        prize_pool: cfg.seedPool,
        ticket_price_tokens: cfg.ticketPriceTokens,
        winners_per_draw: cfg.winnersPerDraw,
        total_tickets: 0,
        draws_at: drawsAt,
        closed: false,
        updated_at: new Date().toISOString(),
      });
      return { round: 'r1', pool: cfg.seedPool, totalTickets: 0, drawsAt, closed: false };
    }
    return {
      round: String(row.id ?? 'r1'),
      pool: Number(row.pool ?? row.prize_pool ?? cfg.seedPool),
      totalTickets: Number(row.total_tickets ?? 0),
      drawsAt: row.draws_at ? new Date(row.draws_at as string).toISOString() : drawsAt,
      closed: row.closed === true,
    };
  }

  if (!isServerFirebaseReady()) {
    return { round: 'r1', pool: cfg.seedPool, totalTickets: 0, drawsAt, closed: false };
  }

  const snap = await db().doc(ROUND).get();
  if (!snap.exists) {
    const seed = { round: 'r1', pool: cfg.seedPool, totalTickets: 0, drawsAt: new Date(drawsAt), closed: false, createdAt: now(), updatedAt: now() };
    await db().doc(ROUND).set(seed);
    return { round: 'r1', pool: cfg.seedPool, totalTickets: 0, drawsAt, closed: false };
  }

  const data = snap.data() as Record<string, unknown>;
  return {
    round: str(data.round, 'r1'),
    pool: int(data.pool, cfg.seedPool),
    totalTickets: int(data.totalTickets),
    drawsAt: iso(data.drawsAt) ?? drawsAt,
    closed: bool(data.closed),
  };
}

export async function getLotteryState(uid: string | null): Promise<LotteryState> {
  const economy = await getEconomy();
  const cfg = economy.lottery;
  const round = await readRound();

  let myTickets: LotteryTicket[] = [];

  if (uid && isSupabaseBackend) {
    const { supabaseListMyTickets } = await import('../data-supabase');
    const rows = await supabaseListMyTickets(uid, 50);
    myTickets = rows.map((d) => ({
      id: String(d.ticket_id ?? d.id ?? ''),
      status: (String(d.status ?? 'Pending') as LotteryTicket['status']),
      at: d.created_at ? new Date(d.created_at as string).toISOString() : new Date().toISOString(),
      prize: Number(d.prize ?? 0),
    }));
  } else if (uid && isServerFirebaseReady()) {
    /* Across all rounds, newest first: a user wants to see the ones that lost as
       well as the ones still pending. */
    const snap = await db()
      .collection('lotteryTickets')
      .where('uid', '==', uid)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    myTickets = snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: str(data.ticketId, doc.id),
        status: (str(data.status, 'Pending') as LotteryTicket['status']),
        at: isoOr(data.createdAt),
        prize: int(data.prize),
      };
    });
  }

  return {
    round: round.round,
    prizePool: round.pool,
    ticketPriceTokens: cfg.ticketPriceTokens,
    totalTickets: round.totalTickets,
    winnersPerDraw: cfg.winnersPerDraw,
    drawsAt: round.drawsAt,
    myTickets,
    maxPerUser: cfg.maxTicketsPerUserPerRound,
  };
}

export async function buyLotteryTickets(args: {
  uid: string;
  count: number;
  ip: string | null;
}): Promise<{ bought: number; balance: number; pool: number; tickets: LotteryTicket[] }> {
  const [economy, site] = await Promise.all([getEconomy(), getSiteConfig()]);
  if (!site.earningOpen) throw new AppError('The lottery is paused right now.', 503, 'earning_paused');

  const cfg = economy.lottery;
  const count = Math.max(1, Math.min(cfg.maxTicketsPerUserPerRound, Math.floor(args.count)));
  const round = await readRound();
  if (round.closed) throw new AppError('This round has closed. The next one opens after the draw.', 400, 'round_closed');

  let already: number;
  if (isSupabaseBackend) {
    const { supabaseCountTicketsInRound } = await import('../data-supabase');
    already = await supabaseCountTicketsInRound(args.uid, round.round);
  } else {
    const held = await db()
      .collection('lotteryTickets')
      .where('uid', '==', args.uid)
      .where('round', '==', round.round)
      .count()
      .get();
    already = int(held.data().count);
  }
  if (already + count > cfg.maxTicketsPerUserPerRound) {
    throw new AppError(
      `You can hold at most ${cfg.maxTicketsPerUserPerRound} tickets per round — you have ${already}.`,
      400,
      'ticket_cap',
    );
  }

  const cost = count * cfg.ticketPriceTokens;
  const result = await debit({
    uid: args.uid,
    amount: cost,
    source: 'lottery',
    label: `${count} lottery ticket${count > 1 ? 's' : ''}`,
    refId: round.round,
  });

  /* The pool grows by the ticket revenue's payout share; the remainder is the
     house edge that funds the seed of the next round. */
  const poolAdd = Math.floor((cost * cfg.payoutBps) / 10_000);
  const at = new Date().toISOString();
  const tickets: LotteryTicket[] = [];

  if (isSupabaseBackend) {
    const { supabaseInsertTickets, supabaseUpsertLotteryRound } = await import('../data-supabase');
    const rows: Array<Record<string, unknown>> = [];
    for (let i = 0; i < count; i++) {
      const ticketId = randomUUID();
      rows.push({
        ticket_id: ticketId,
        user_id: args.uid,
        round_id: round.round,
        status: 'Pending',
        prize: 0,
      });
      tickets.push({ id: ticketId, status: 'Pending', at, prize: 0 });
    }
    await supabaseInsertTickets(rows);
    await supabaseUpsertLotteryRound({
      id: round.round,
      pool: round.pool + poolAdd,
      total_tickets: round.totalTickets + count,
      updated_at: at,
    });
    return { bought: count, balance: result.balance, pool: round.pool + poolAdd, tickets };
  }

  const batch = db().batch();

  for (let i = 0; i < count; i++) {
    const ticketId = randomUUID();
    batch.set(db().doc(`lotteryTickets/${ticketId}`), {
      ticketId,
      uid: args.uid,
      round: round.round,
      status: 'Pending',
      prize: 0,
      createdAt: now(),
    });
    tickets.push({ id: ticketId, status: 'Pending', at, prize: 0 });
  }

  batch.set(
    db().doc(ROUND),
    {
      pool: FieldValue.increment(poolAdd),
      totalTickets: FieldValue.increment(count),
      updatedAt: now(),
    },
    { merge: true },
  );

  await batch.commit();

  return { bought: count, balance: result.balance, pool: round.pool + poolAdd, tickets };
}

/**
 * Run the draw. Called by the scheduled Cloud Function and by
 * Admin → Modules → Lottery.
 */
export async function drawLottery(actorUid: string): Promise<{ round: string; winners: Array<{ uid: string; ticketId: string; prize: number }> }> {
  const economy = await getEconomy();
  const cfg = economy.lottery;
  const round = await readRound();

  const seed = randomUUID();
  await db().doc(ROUND).set({ closed: true, seed, closedAt: now(), updatedAt: now() }, { merge: true });

  const snap = await db()
    .collection('lotteryTickets')
    .where('round', '==', round.round)
    .where('status', '==', 'Pending')
    .limit(20000)
    .get();

  if (snap.empty) {
    await openNextRound(round, cfg.seedPool);
    return { round: round.round, winners: [] };
  }

  /* Deterministic shuffle from the published seed, so the result is checkable. */
  const docs = [...snap.docs];
  const rng = mulberry32(hashSeed(seed));
  for (let i = docs.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [docs[i], docs[j]] = [docs[j]!, docs[i]!];
  }

  const winnerCount = Math.min(cfg.winnersPerDraw, docs.length);
  const perWinner = Math.floor(round.pool / Math.max(1, winnerCount));
  const winners: Array<{ uid: string; ticketId: string; prize: number }> = [];

  for (let i = 0; i < winnerCount; i++) {
    const doc = docs[i]!;
    const uid = str(doc.get('uid'));
    if (!uid) continue;

    await credit({
      uid,
      source: 'lottery',
      amount: perWinner,
      label: `Lottery win — round ${round.round}`,
      refId: doc.id,
      idempotencyKey: `lotto_${round.round}_${doc.id}`,
      applyBonus: false,
      score: false,
    });

    await doc.ref.update({ status: 'Won', prize: perWinner, drawnAt: now() });
    await pushNotification(uid, {
      icon: 'ticket',
      tone: 'violet',
      title: 'You won the lottery draw',
      body: `${perWinner.toLocaleString('en-US')} tokens have been credited.`,
      href: '/lottery',
    });
    winners.push({ uid, ticketId: doc.id, prize: perWinner });
  }

  /* Everything not drawn loses; done in chunks so a large round does not exceed
     the 500-write batch limit. */
  const losers = docs.slice(winnerCount);
  for (let i = 0; i < losers.length; i += 400) {
    const batch = db().batch();
    for (const doc of losers.slice(i, i + 400)) {
      batch.update(doc.ref, { status: 'Lost', drawnAt: now() });
    }
    await batch.commit();
  }

  await db().collection('lotteryDraws').add({
    round: round.round,
    seed,
    pool: round.pool,
    ticketCount: docs.length,
    winners,
    drawnBy: actorUid,
    createdAt: now(),
  });

  await openNextRound(round, cfg.seedPool);
  return { round: round.round, winners };
}

async function openNextRound(previous: RoundData, seedPool: number): Promise<void> {
  const economy = await getEconomy();
  const next = `r${Number(previous.round.replace(/\D/g, '') || 1) + 1}`;
  await db().doc(ROUND).set({
    round: next,
    pool: seedPool,
    totalTickets: 0,
    closed: false,
    drawsAt: nextUtcWeekday(economy.lottery.drawDayUtc, economy.lottery.drawHourUtc),
    createdAt: now(),
    updatedAt: now(),
  });
}

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
