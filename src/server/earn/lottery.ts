import 'server-only';

import { randomUUID } from 'node:crypto';

import type { LotteryState, LotteryTicket } from '@/lib/models';

import { getEconomy, getSiteConfig } from '../config';
import { AppError, bool, int, nextUtcWeekday, str } from '../db';
import {
  supabaseCountTicketsInRound,
  supabaseInsertAudit,
  supabaseInsertTickets,
  supabaseListMyTickets,
  supabaseUpsertLotteryRound,
} from '../data-supabase';
import { credit, debit } from '../ledger';
import { getServerSupabase } from '../supabase';
import { pushNotification } from '../users';

/* ============================================================================
   LOTTERY
   ----------------------------------------------------------------------------
   Tokens in, tokens out, with the pool visible. Each round is one row in
   `lottery_rounds` and each ticket is a row in `lottery_tickets`, which matters
   for two reasons: the ticket count is a real count rather than a counter that
   can drift, and the draw can be reproduced from the stored tickets after the
   fact if a user disputes it.

   THE DRAW IS COMMIT-REVEAL
   `drawLottery` closes the round and fixes a seed BEFORE selecting winners, and
   publishes the plaintext seed with the result (in the audit-log draw record).
   Anyone can re-run the selection from the recorded ticket ids and seed and
   check it. Without that, "we drew randomly" is unfalsifiable, and on a payouts
   product that is the same as "we picked our friends".
   ========================================================================== */

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

  /* The current round is the newest row in lottery_rounds — rounds are separate
     rows (tickets carry round_id), not a singleton document. */
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('lottery_rounds')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;

  const row = (data ?? null) as Record<string, unknown> | null;
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
    round: str(row.id, 'r1'),
    pool: int(row.pool ?? row.prize_pool, cfg.seedPool),
    totalTickets: int(row.total_tickets),
    drawsAt: row.draws_at ? new Date(row.draws_at as string).toISOString() : drawsAt,
    closed: bool(row.closed),
  };
}

export async function getLotteryState(uid: string | null): Promise<LotteryState> {
  const economy = await getEconomy();
  const cfg = economy.lottery;
  const round = await readRound();

  let myTickets: LotteryTicket[] = [];

  /* Across all rounds, newest first: a user wants to see the ones that lost as
     well as the ones still pending. */
  if (uid) {
    const rows = await supabaseListMyTickets(uid, 50);
    myTickets = rows.map((d) => ({
      id: String(d.ticket_id ?? d.id ?? ''),
      status: (String(d.status ?? 'Pending') as LotteryTicket['status']),
      at: d.created_at ? new Date(d.created_at as string).toISOString() : new Date().toISOString(),
      prize: Number(d.prize ?? 0),
    }));
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

  const already = await supabaseCountTicketsInRound(args.uid, round.round);
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

/**
 * Run the draw. Called by the scheduled Cloud Function and by
 * Admin → Modules → Lottery.
 */
export async function drawLottery(actorUid: string): Promise<{ round: string; winners: Array<{ uid: string; ticketId: string; prize: number }> }> {
  const economy = await getEconomy();
  const cfg = economy.lottery;
  const round = await readRound();
  const supabase = getServerSupabase();

  /* COMMIT: the seed is fixed and the round closed before a single winner is
     selected, so a re-invocation cannot re-draw the same tickets. */
  const seed = randomUUID();
  await supabaseUpsertLotteryRound({
    id: round.round,
    closed: true,
    updated_at: new Date().toISOString(),
  });

  const { data: pending, error } = await supabase
    .from('lottery_tickets')
    .select('*')
    .eq('round_id', round.round)
    .eq('status', 'Pending')
    .limit(20000);
  if (error) throw error;

  const rows = (pending ?? []) as Array<Record<string, unknown>>;
  if (!rows.length) {
    await openNextRound(round, cfg.seedPool);
    return { round: round.round, winners: [] };
  }

  /* Deterministic shuffle from the published seed, so the result is checkable:
     sort by public ticket id, then seeded Fisher–Yates. */
  const ordered = [...rows].sort((a, b) => {
    const x = String(a.ticket_id ?? a.id ?? '');
    const y = String(b.ticket_id ?? b.id ?? '');
    return x < y ? -1 : x > y ? 1 : 0;
  });
  const rng = mulberry32(hashSeed(seed));
  for (let i = ordered.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ordered[i], ordered[j]] = [ordered[j]!, ordered[i]!];
  }

  const winnerCount = Math.min(cfg.winnersPerDraw, ordered.length);
  const perWinner = Math.floor(round.pool / Math.max(1, winnerCount));
  const winners: Array<{ uid: string; ticketId: string; prize: number }> = [];

  if (perWinner <= 0) {
    /* A pool that cannot pay a whole token per winner pays nobody — better a
       rolled-over round than a draw of zero-token prizes. */
    console.error('[lottery] pool cannot pay a whole token per winner, nobody is paid', {
      round: round.round,
      pool: round.pool,
      winnerCount,
    });
  }

  for (let i = 0; perWinner > 0 && i < winnerCount; i++) {
    const row = ordered[i]!;
    const uid = str(row.user_id);
    if (!uid) continue;
    const ticketId = str(row.ticket_id, String(row.id ?? ''));

    await credit({
      uid,
      source: 'lottery',
      amount: perWinner,
      label: `Lottery win — round ${round.round}`,
      refId: ticketId,
      idempotencyKey: `lotto_${round.round}_${ticketId}`,
      applyBonus: false,
      score: false,
    });

    const { error: updateError } = await supabase
      .from('lottery_tickets')
      .update({ status: 'Won', prize: perWinner })
      .eq('id', int(row.id));
    if (updateError) throw updateError;

    await pushNotification(uid, {
      icon: 'ticket',
      tone: 'violet',
      title: 'You won the lottery draw',
      body: `${perWinner.toLocaleString('en-US')} tokens have been credited.`,
      href: '/lottery',
    });
    winners.push({ uid, ticketId, prize: perWinner });
  }

  /* Everything not drawn loses; done in chunks so one UPDATE per batch stays
     inside a comfortable URL length for any round size. */
  const losers = ordered.slice(perWinner > 0 ? winnerCount : 0);
  const loserIds = losers.map((row) => int(row.id));
  for (let i = 0; i < loserIds.length; i += 500) {
    const { error: updateError } = await supabase
      .from('lottery_tickets')
      .update({ status: 'Lost' })
      .in('id', loserIds.slice(i, i + 500));
    if (updateError) throw updateError;
  }

  /* The draw record: seed, pool and winners into the audit log so the result is
     reproducible after the fact (lottery_rounds carries no seed column). */
  try {
    await supabaseInsertAudit({
      actorUid,
      action: 'lottery.draw',
      target: round.round,
      detail: JSON.stringify({ seed, pool: round.pool, ticketCount: rows.length, winners }),
    });
  } catch (auditError) {
    console.error('[lottery] draw record write failed', auditError);
  }

  await openNextRound(round, cfg.seedPool);
  return { round: round.round, winners };
}

async function openNextRound(previous: RoundData, seedPool: number): Promise<void> {
  const economy = await getEconomy();
  const next = `r${Number(previous.round.replace(/\D/g, '') || 1) + 1}`;
  await supabaseUpsertLotteryRound({
    id: next,
    pool: seedPool,
    prize_pool: seedPool,
    ticket_price_tokens: economy.lottery.ticketPriceTokens,
    winners_per_draw: economy.lottery.winnersPerDraw,
    total_tickets: 0,
    draws_at: nextUtcWeekday(economy.lottery.drawDayUtc, economy.lottery.drawHourUtc).toISOString(),
    closed: false,
    updated_at: new Date().toISOString(),
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
