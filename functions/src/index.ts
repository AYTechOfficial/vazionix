/* ============================================================================
   VAZIONIX — CLOUD FUNCTIONS
   ============================================================================

   WHY THERE IS NO CLAIM FUNCTION IN THIS FILE
   ----------------------------------------------------------------------------
   Every user-initiated money operation in this product runs in a Next.js Route
   Handler under `../src/server/**`, on the Admin SDK, in the same request that
   the user's click produced: faucet claims, PTC and shortlink completion, the
   daily bonus, challenges, lottery ticket purchase, coupon redemption,
   withdrawal requests, offerwall postbacks, and every admin action behind the
   console. `../src/server/ledger.ts` is the only writer of `balance`.

   That is not a migration in progress. It is the split:

     ROUTE HANDLER          anything with a caller waiting for the answer. It
                            already holds the authenticated session, the request
                            IP, the captcha token and the user agent — the four
                            things every anti-abuse check needs and the four
                            things a Firestore trigger does not have. It can
                            also reply with the new balance, which a trigger
                            cannot, so the UI never has to guess.

     CLOUD FUNCTION         what a request-scoped server cannot do at all: work
                            on a clock (weekly settlements, hourly sweeps, price
                            refreshes), Auth lifecycle events (an account
                            deletion has no HTTP request behind it), Firestore
                            triggers that must fire regardless of which client
                            wrote the document, and minting Auth custom claims.

   A callable that duplicates a Route Handler is worse than redundant. It is a
   second implementation of a money path, reachable by anyone holding a Firebase
   ID token, that will drift from the first and be absent from the review of the
   second. Fourteen such callables were deleted from this file for that reason;
   the list is at the bottom so the next reader does not go hunting for them in
   the git history.

   Exactly one callable survives — `setStaffRole` — because `setCustomUserClaims`
   needs the Admin SDK and there is a bootstrapping problem: until a super_admin
   exists, no Route Handler can authorise the call that creates one.

   ----------------------------------------------------------------------------
   FIVE RULES, OBEYED BY EVERYTHING BELOW
   ----------------------------------------------------------------------------
   1. IDEMPOTENT. Every function can run twice on the same input without a
      second effect. Postbacks retry, schedulers overlap, deploys race, and
      Cloud Scheduler's contract is at-least-once delivery, not exactly-once.
      In practice that means a deterministic id on every write that pays:
      `lb_${period}_${board}`, `lotto_${round}_${ticketId}`, `refqual_${uid}`,
      `wdref_${withdrawalId}`. The last two are shared with the web app on
      purpose — that is what stops both halves of the product from paying.

   2. TRANSACTIONAL. A balance mutation and the `/users/{uid}/claims` row that
      explains it commit together, through `creditTokens` in `./ledger`. A
      balance change with no matching claim document is a bug by definition.

   3. INTEGER TOKENS. Balances are integers. Asset amounts are decimal STRINGS
      and are never parsed into a float here; this bundle does not price
      anything, it moves rows a Route Handler already priced.

   4. FAIL LOUD, PAY NEVER. On any ambiguity — an unreadable price, a round
      larger than the draw can hold, a suspended winner — the function refuses
      to credit and says so. An uncredited prize is a support ticket. An
      over-credit is a reconciliation.

   5. BOUNDED AND RESUMABLE. Every query has a `limit()`. Every sweep carries a
      write budget and a wall clock (`Budget` in `./core`), and the sweeps that
      can outgrow one invocation persist a cursor so a timeout resumes instead
      of restarting. A job that never finishes is a job that never runs.
   ========================================================================== */

import { createHash, randomUUID } from 'node:crypto';

import type { Query, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { region as regionV1 } from 'firebase-functions/v1';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule, type ScheduledEvent } from 'firebase-functions/v2/scheduler';

import {
  BOARDS,
  DEFAULT_SPOT,
  earningBonusBps,
  isLockedDown,
  readEconomy,
  readSiteFlags,
  readUsdPerToken,
  tierForCount,
  type CoinTicker,
  type LeaderboardBoardId,
} from './config';
import {
  Budget,
  FieldPath,
  FieldValue,
  Timestamp,
  auth,
  bool,
  chunk,
  dayKey,
  db,
  fnv1a,
  int,
  millis,
  mulberry32,
  nextUtcWeekday,
  now,
  num,
  shuffle,
  str,
  weekKey,
} from './core';
import {
  SYSTEM_ACTOR,
  audit,
  auditDoc,
  auditRef,
  creditTokens,
  notificationDoc,
  notify,
} from './ledger';

/* ----------------------------------------------------------------------------
   Region is pinned rather than defaulted: Firestore triggers must run in the
   database's region, and the v1 Auth trigger below carries its own region call.
   Both are us-central1 so the two halves of the bundle cannot diverge.

   `concurrency` is deliberately unset. Cloud Run refuses a concurrency above 1
   on a function with less than a full vCPU, so pinning it here would make every
   function's memory setting a deploy-time constraint for no gain — these are
   scheduled jobs, not a request path.
   -------------------------------------------------------------------------- */
setGlobalOptions({
  region: 'us-central1',
  maxInstances: 20,
  memory: '256MiB',
  timeoutSeconds: 120,
});

/** Firestore commits at most 500 writes per batch. 400 leaves room for the
    audit row and the notification that ride along with a state change. */
const BATCH = 400;

/** The scheduler's own idea of when this run was due, which is what a job keys
    off — not `Date.now()`, which drifts by however long the queue was. */
function scheduledAt(event: ScheduledEvent): Date {
  const parsed = Date.parse(event.scheduleTime ?? '');
  return Number.isNaN(parsed) ? new Date() : new Date(parsed);
}

/** Delete everything a query matches, in pages, until the budget runs out.
    Returns the count so the caller can log what it actually managed.

    `guard` is not optional decoration. Firestore compares across types before it
    compares values, so a range filter on a timestamp field also matches rows
    where that field is null — and "no expiry" must never be read as "expired".
    A page that yields nothing deletable ends the loop rather than re-reading the
    same malformed rows forever. */
async function deleteMatching(
  query: Query,
  budget: Budget,
  guard: (doc: QueryDocumentSnapshot) => boolean,
): Promise<number> {
  let deleted = 0;
  while (budget.ok()) {
    const snap = await query.limit(BATCH).get();
    if (snap.empty) break;

    const deletable = snap.docs.filter(guard);
    if (!deletable.length) {
      logger.warn('[cleanup] page held nothing deletable, leaving it for a human', {
        page: snap.size,
      });
      break;
    }

    const batch = db().batch();
    for (const doc of deletable) batch.delete(doc.ref);
    await batch.commit();

    deleted += deletable.length;
    budget.spend(deletable.length);
    if (snap.size < BATCH) break;
  }
  return deleted;
}

/* ============================================================================
   1. onUserDeleted  —  Auth trigger, user deletion
   ----------------------------------------------------------------------------
   An account deletion has no HTTP request behind it. It can come from the
   account page, from the Firebase console, from a GDPR erasure run or from the
   Admin SDK during an abuse cleanup, and in three of those four cases no Route
   Handler of ours executes. That is the whole reason this is a trigger.

   THIS IS A SOFT DELETE, AND THE LEDGER IS NEVER TOUCHED
   `/users/{uid}/claims` is the audit trail for every token that ever existed.
   Deleting it would make the platform counters unexplainable and the next
   chargeback or bonus-abuse investigation unanswerable. The user document is
   marked `deletedAt` and suspended instead, which also means no later prize
   payout can land on it.

   ORDER OF OPERATIONS, AND WHY
     1. Mark the profile deleted first. Everything after this point is cleanup,
        and cleanup that runs against a profile still readable as live is how a
        deleted account gets a leaderboard prize.
     2. Release `/usernames/{lower}` — but only if it still points at this uid.
        A rename leaves an orphaned document behind, and a signup may already
        have taken the handle; deleting somebody else's claim would break their
        login.
     3. Cancel withdrawals that have NOT been broadcast, refunding
        `lockedBalance` back to `balance` with a compensating ledger row.

   WHY ONLY Pending AND HeldForReview
     Those two hold locked tokens and nothing has left the treasury. `Processing`
     means a batch has been handed to a signer and may already be on a chain:
     refunding it would pay the user twice. A `Processing` row belonging to a
     deleted account is left for an operator, which is the correct outcome.

   ON FAILURE
     Each withdrawal is its own transaction and each is guarded by the same
     `wdref_${id}` claim id the web app's refund path uses, so a partial run,
     a retry, or a Route Handler that already refunded cannot double-credit.
     The trigger does not retry (`failurePolicy` unset) because the sweeps that
     follow it are idempotent and a stuck retry loop on a deleted account is
     noise nobody will read.
   ========================================================================== */
export const onUserDeleted = regionV1('us-central1')
  .auth.user()
  .onDelete(async (user): Promise<void> => {
    const uid = user.uid;
    const userRef = db().doc(`users/${uid}`);
    const snap = await userRef.get();

    if (snap.exists) {
      await userRef.set(
        {
          deletedAt: now(),
          suspended: true,
          suspendedReason: 'Account deleted',
          suspendedUntil: null,
          updatedAt: now(),
        },
        { merge: true },
      );
    }

    const lower = str(snap.get('usernameLower')) || str(snap.get('username')).toLowerCase();
    if (lower) {
      const nameRef = db().doc(`usernames/${lower}`);
      const nameSnap = await nameRef.get();
      if (nameSnap.exists && str(nameSnap.get('uid')) === uid) await nameRef.delete();
    }

    let refunded = 0;
    let cancelled = 0;

    /* Two equality-only queries rather than one `in` filter: an `in` over a
       second field turns this into a composite-index question for no benefit at
       a cardinality of at most a handful of rows per user. */
    for (const status of ['Pending', 'HeldForReview'] as const) {
      const queued = await db()
        .collection('withdrawals')
        .where('uid', '==', uid)
        .where('status', '==', status)
        .limit(25)
        .get();

      for (const doc of queued.docs) {
        try {
          const tokens = await cancelQueuedWithdrawal(uid, doc.id, 'Account deleted');
          if (tokens >= 0) cancelled += 1;
          refunded += tokens;
        } catch (error) {
          logger.error('[onUserDeleted] withdrawal cancel failed', { uid, id: doc.id, error });
        }
      }
    }

    await audit({
      actorUid: SYSTEM_ACTOR,
      action: 'user.delete',
      target: uid,
      detail: `Account deleted. ${cancelled} queued withdrawal(s) cancelled, ${refunded} tokens released. Ledger retained.`,
    });

    logger.info('[onUserDeleted] cleaned up', { uid, cancelled, refunded });
  });

/**
 * Reject one un-broadcast withdrawal and return its locked tokens.
 *
 * Returns the tokens released, or 0 when there was nothing to do. The refund
 * claim id is `wdref_${withdrawalId}` — the same key `../src/server/withdraw.ts`
 * uses — so the refund is idempotent across BOTH code paths, not just this one.
 */
async function cancelQueuedWithdrawal(
  uid: string,
  withdrawalId: string,
  reason: string,
): Promise<number> {
  const wdRef = db().doc(`withdrawals/${withdrawalId}`);
  const userRef = db().doc(`users/${uid}`);
  const refundRef = db().doc(`users/${uid}/claims/wdref_${withdrawalId}`);

  return db().runTransaction<number>(async (tx) => {
    const [wd, userSnap, refund] = await Promise.all([
      tx.get(wdRef),
      tx.get(userRef),
      tx.get(refundRef),
    ]);
    if (!wd.exists) return 0;

    const status = str(wd.get('status'));
    if (status !== 'Pending' && status !== 'HeldForReview') return 0;

    tx.update(wdRef, {
      status: 'Rejected',
      failureReason: reason,
      reviewedBy: SYSTEM_ACTOR,
      processedAt: now(),
      updatedAt: now(),
    });

    const tokens = int(wd.get('tokenCost'));
    if (tokens <= 0 || refund.exists || !userSnap.exists) return 0;

    tx.update(userRef, {
      balance: FieldValue.increment(tokens),
      lockedBalance: FieldValue.increment(-tokens),
      updatedAt: now(),
    });

    tx.create(refundRef, {
      source: 'refund',
      amount: tokens,
      baseAmount: tokens,
      exp: 0,
      refId: withdrawalId,
      label: `Withdrawal refunded — ${reason}`,
      bonusBps: 0,
      ip: null,
      day: dayKey(),
      createdAt: now(),
      updatedAt: now(),
    });

    return tokens;
  });
}

/* ============================================================================
   2. resetLeaderboards  —  scheduled, Sunday 00:00 UTC
   ----------------------------------------------------------------------------
   Closes the week's five boards, pays the prizes, opens the next week.

   THE ORDER IS THE DESIGN. Each step exists because the step before it made the
   next one safe:

     (a) FREEZE   `closed: true` on `/leaderboard/current`. A prize computed
                  over a board that is still moving is not reproducible, and
                  "why did I drop a place while you were paying" has no answer.

     (b) RANK     per board, entries ordered by `value` desc, limited to
                  `economy.leaderboard.size`, then tie-broken IN MEMORY by
                  earliest `updatedAt` so whoever got there first wins. Never
                  by uid, which would systematically favour older accounts, and
                  never randomly. The ranked rows are written to the ARCHIVE
                  before a single token moves, and the period document is
                  stamped `rankedAt`. That stamp is what makes step (c) safe to
                  re-run: a second invocation pays from the frozen archive
                  instead of re-ranking a board that kept receiving scores while
                  the first invocation was paying.

     (c) PAY      `prizePoolPerBoard × payoutCurveBps[rank-1] / 10000`, floored,
                  one transaction per winner, claim id `lb_${period}_${board}`.
                  A winner whose claim id already exists is skipped, so a re-run
                  after a timeout pays nobody twice.

     (d) PODIUM   top three per board written onto the period document, so the
                  UI renders the podium in ONE document read instead of five
                  ordered queries.

     (e) ROTATE   delete `current/entries` and write a fresh `current`. Last,
                  because everything above reads from it.

   ON FAILURE
     A crash before (b) completes leaves the board frozen and unpaid; the next
     invocation re-ranks and pays. A crash during (c) leaves some winners paid;
     the next invocation pays the rest from the archive. A crash before (e)
     leaves `current` closed with its entries intact — scores written in the
     meantime are carried into the re-run rather than lost.

   ACCEPTED COST
     Scores that land between (a) and (e) are counted into the settled period
     and then deleted with it. The alternative — two live entry collections and
     a pointer — costs the ledger an extra read on every single claim.
   ========================================================================== */

interface RankedRow {
  uid: string;
  username: string;
  countryCode: string;
  value: number;
  tokens: number;
  updatedAtMs: number;
  finalRank: number;
  prizeTokens: number;
}

/** Read a live board and decide the final order. The prize curve is applied
    here so the archive, the podium and the payout cannot disagree. */
async function rankLiveBoard(
  board: LeaderboardBoardId,
  size: number,
  pool: number,
  curve: readonly number[],
): Promise<RankedRow[]> {
  const snap = await db()
    .collection('leaderboard/current/entries')
    .where('board', '==', board)
    .orderBy('value', 'desc')
    .limit(size)
    .get();

  const rows = snap.docs.map((doc) => ({
    uid: str(doc.get('uid'), doc.id.split('_')[0] ?? doc.id),
    username: str(doc.get('username'), 'member'),
    countryCode: str(doc.get('countryCode'), 'XX'),
    value: int(doc.get('value')),
    tokens: int(doc.get('tokens')),
    updatedAtMs: millis(doc.get('updatedAt')),
  }));

  rows.sort((a, b) => b.value - a.value || a.updatedAtMs - b.updatedAtMs);

  return rows.map((row, index) => ({
    ...row,
    finalRank: index + 1,
    prizeTokens: Math.floor((pool * (curve[index] ?? 0)) / 10_000),
  }));
}

/** Read a board back out of the archive, for a re-run. Ordered by the rank the
    first invocation committed, so the payout cannot shift between attempts. */
async function readRankedBoard(
  period: string,
  board: LeaderboardBoardId,
  size: number,
): Promise<RankedRow[]> {
  const snap = await db()
    .collection(`leaderboard/${period}/entries`)
    .where('board', '==', board)
    .orderBy('finalRank', 'asc')
    .limit(size)
    .get();

  return snap.docs.map((doc) => ({
    uid: str(doc.get('uid'), doc.id.split('_')[0] ?? doc.id),
    username: str(doc.get('username'), 'member'),
    countryCode: str(doc.get('countryCode'), 'XX'),
    value: int(doc.get('value')),
    tokens: int(doc.get('tokens')),
    updatedAtMs: millis(doc.get('updatedAt')),
    finalRank: int(doc.get('finalRank'), 1),
    prizeTokens: int(doc.get('prizeTokens')),
  }));
}

export const resetLeaderboards = onSchedule(
  {
    schedule: '0 0 * * 0',
    timeZone: 'Etc/UTC',
    retryCount: 1,
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async (event: ScheduledEvent): Promise<void> => {
    const economy = await readEconomy();
    const cfg = economy.leaderboard;
    const at = scheduledAt(event);

    /* The run fires at the very start of the Sunday that ends the ISO week it
       settles, so the period id is taken from an hour earlier — inside the week
       being closed. The fresh board is labelled with the week that starts the
       following day. */
    const period = weekKey(new Date(at.getTime() - 3_600_000));
    const nextPeriod = weekKey(new Date(at.getTime() + 25 * 3_600_000));
    const periodRef = db().doc(`leaderboard/${period}`);
    const budget = new Budget(470, 6000);

    /* (a) FREEZE */
    await db()
      .doc('leaderboard/current')
      .set({ period, closed: true, closedAt: now(), updatedAt: now() }, { merge: true });

    /* (b) RANK — from the archive on a re-run, from the live board otherwise. */
    const periodSnap = await periodRef.get();
    const alreadyRanked = periodSnap.exists && periodSnap.get('rankedAt') != null;
    const ranked = new Map<LeaderboardBoardId, RankedRow[]>();

    for (const board of BOARDS) {
      ranked.set(
        board,
        alreadyRanked
          ? await readRankedBoard(period, board, cfg.size)
          : await rankLiveBoard(board, cfg.size, cfg.prizePoolPerBoard, cfg.payoutCurveBps),
      );
    }

    if (!alreadyRanked) {
      for (const board of BOARDS) {
        for (const page of chunk(ranked.get(board) ?? [], 150)) {
          const batch = db().batch();
          for (const row of page) {
            batch.set(periodRef.collection('entries').doc(`${row.uid}_${board}`), {
              uid: row.uid,
              username: row.username,
              countryCode: row.countryCode,
              board,
              period,
              value: row.value,
              tokens: row.tokens,
              finalRank: row.finalRank,
              prizeTokens: row.prizeTokens,
              updatedAt: now(),
            });
            /* Stamped onto the live row as well, so the settled board renders
               with its ranks and prizes before the rotation finishes. */
            batch.set(
              db().doc(`leaderboard/current/entries/${row.uid}_${board}`),
              { period, finalRank: row.finalRank, prizeTokens: row.prizeTokens, updatedAt: now() },
              { merge: true },
            );
          }
          await batch.commit();
          budget.spend(page.length * 2);
        }
      }

      /* `rankedAt` is written before any token moves. It is the commitment that
         makes the payout below re-runnable against a fixed ranking. */
      await periodRef.set(
        {
          period,
          closed: true,
          rankedAt: now(),
          startsAt: Timestamp.fromMillis(at.getTime() - 7 * 86_400_000),
          endsAt: Timestamp.fromDate(at),
          updatedAt: now(),
        },
        { merge: true },
      );
    }

    /* (c) PAY */
    let paidTokens = 0;
    let paidWinners = 0;

    for (const board of BOARDS) {
      for (const row of ranked.get(board) ?? []) {
        if (row.prizeTokens <= 0) continue;
        if (!budget.ok()) {
          logger.warn('[resetLeaderboards] budget exhausted mid-payout, the retry finishes it', {
            period,
            board,
            rank: row.finalRank,
          });
          break;
        }

        try {
          const result = await creditTokens({
            uid: row.uid,
            source: 'challenge',
            amount: row.prizeTokens,
            label: `Leaderboard prize — ${board} #${row.finalRank}`,
            refId: `${period}:${board}`,
            idempotencyKey: `lb_${period}_${board}`,
            applyBonus: false,
            score: false,
          });
          budget.spend(2);
          if (result.replayed) continue;

          paidTokens += result.credited;
          paidWinners += 1;
          await notify(row.uid, {
            icon: 'flame',
            tone: 'violet',
            title: `#${row.finalRank} on the ${board} board`,
            body: `${result.credited.toLocaleString('en-US')} tokens for ${period} are in your balance.`,
            href: '/leaderboard',
          });
        } catch (error) {
          /* A suspended or deleted winner throws here. Log it and keep paying
             the rest — one ineligible row must not hold up four other boards. */
          logger.error('[resetLeaderboards] prize refused', {
            period,
            board,
            uid: row.uid,
            rank: row.finalRank,
            error,
          });
        }
      }
    }

    /* (d) PODIUM */
    const podium: Record<string, Array<Record<string, unknown>>> = {};
    for (const board of BOARDS) {
      podium[board] = (ranked.get(board) ?? []).slice(0, 3).map((row) => ({
        uid: row.uid,
        username: row.username,
        countryCode: row.countryCode,
        value: row.value,
        finalRank: row.finalRank,
        prizeTokens: row.prizeTokens,
      }));
    }

    await periodRef.set(
      { podium, settledAt: now(), prizeTokensPaid: paidTokens, updatedAt: now() },
      { merge: true },
    );

    /* (e) ROTATE */
    await db().recursiveDelete(db().collection('leaderboard/current/entries'));
    await db().doc('leaderboard/current').set({
      period: nextPeriod,
      closed: false,
      podium: {},
      startsAt: Timestamp.fromDate(at),
      endsAt: Timestamp.fromMillis(at.getTime() + 7 * 86_400_000),
      createdAt: now(),
      updatedAt: now(),
    });

    await audit({
      actorUid: SYSTEM_ACTOR,
      action: 'leaderboard.reset',
      target: period,
      detail: `${paidWinners} winners paid ${paidTokens} tokens across ${BOARDS.length} boards. Opened ${nextPeriod}.`,
    });

    logger.info('[resetLeaderboards] settled', { period, nextPeriod, paidWinners, paidTokens });
  },
);

/* ============================================================================
   3. drawLottery  —  scheduled hourly, draws on the configured weekly slot
   ----------------------------------------------------------------------------
   WHY HOURLY FOR A WEEKLY DRAW
   The slot is `economy.lottery.drawDayUtc` / `drawHourUtc`, and an operator can
   change both from the admin console at run time. A cron expression is fixed at
   deploy time. An hourly tick that draws only when the live config says the slot
   has arrived is the only way to honour a configurable slot without a redeploy;
   the 167 no-op invocations a week cost nothing. A round more than 24 hours
   overdue is drawn regardless of the slot, so a missed draw does not hold the
   pool hostage for another week.

   THE DRAW IS COMMIT-REVEAL, AND THE ORDER IS THE PROOF
     1. Write `closed: true`, the plaintext `seed` and its SHA-256 `seedHash` to
        `/lottery/current` BEFORE reading a single ticket. After this write no
        ticket can be bought and the selection is fully determined — anybody can
        recompute it.
     2. Sort the pending tickets by id, then shuffle with mulberry32 seeded by
        FNV-1a of the published seed (`./core`). Sorting first matters: Firestore
        makes no promise about the order two equality filters return, and a
        shuffle of an unknown order is not reproducible.
     3. Credit, then mark. Idempotency key `lotto_${round}_${ticketId}`.
     4. Append `/lotteryDraws/{round}` with the plaintext seed.
     5. Only then open the next round.

   A re-run REUSES the stored seed. Generating a new one would pick a different
   set of winners after some of the first set had already been paid, which is the
   one failure mode this whole design exists to prevent.

   ON FAILURE
     A crash after step 1 leaves the round closed with its seed; the next tick
     re-derives exactly the same winners and the already-paid ones are skipped by
     their claim ids. A round larger than `TICKET_CAP` is NOT drawn: it is logged
     and audited so an operator runs a paged draw. Refusing to pay is recoverable,
     paying a partial round is not.
   ========================================================================== */

/** One invocation reads at most this many tickets. `maxTicketsPerUserPerRound`
    is 50, so this is a round with at least a thousand distinct players — beyond
    it, the draw needs paging and a human. */
const TICKET_CAP = 50_000;

export const drawLottery = onSchedule(
  {
    schedule: '0 * * * *',
    timeZone: 'Etc/UTC',
    retryCount: 1,
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async (event: ScheduledEvent): Promise<void> => {
    const economy = await readEconomy();
    const cfg = economy.lottery;
    const at = scheduledAt(event);
    const roundRef = db().doc('lottery/current');
    const snap = await roundRef.get();

    /* A project that has never sold a ticket has no round. Seed one and wait
       for the slot rather than drawing an empty pool. */
    if (!snap.exists) {
      await roundRef.set({
        round: 'r1',
        pool: cfg.seedPool,
        totalTickets: 0,
        closed: false,
        seed: null,
        drawsAt: Timestamp.fromDate(nextUtcWeekday(cfg.drawDayUtc, cfg.drawHourUtc, at)),
        createdAt: now(),
        updatedAt: now(),
      });
      return;
    }

    const round = str(snap.get('round'), 'r1');
    const pool = int(snap.get('pool'), cfg.seedPool);
    const closed = bool(snap.get('closed'));
    const drawsAtMs = millis(snap.get('drawsAt'));

    const slotMatches = at.getUTCDay() === cfg.drawDayUtc && at.getUTCHours() === cfg.drawHourUtc;
    const overdue = drawsAtMs > 0 && at.getTime() - drawsAtMs > 86_400_000;

    if (!closed) {
      if (!slotMatches && !overdue) return;
      /* The slot matched but the round was opened for a later one — an operator
         moved the schedule forward. Wait for the date it advertised. */
      if (drawsAtMs > at.getTime() + 60_000 && !overdue) return;
    }

    /* COMMIT. Reuse the stored seed on a re-run; a new seed would move the
       winners after some of them had been paid. */
    const seed = closed && str(snap.get('seed')) ? str(snap.get('seed')) : randomUUID();
    const seedHash = createHash('sha256').update(seed).digest('hex');

    if (!closed) {
      await roundRef.set(
        { closed: true, seed, seedHash, closedAt: now(), updatedAt: now() },
        { merge: true },
      );
    }

    const tickets = await db()
      .collection('lotteryTickets')
      .where('round', '==', round)
      .where('status', '==', 'Pending')
      .limit(TICKET_CAP)
      .get();

    if (tickets.size >= TICKET_CAP) {
      logger.error('[drawLottery] round exceeds the single-invocation cap, refusing to draw', {
        round,
        cap: TICKET_CAP,
      });
      await audit({
        actorUid: SYSTEM_ACTOR,
        action: 'lottery.draw.refused',
        target: round,
        detail: `Round holds at least ${TICKET_CAP} pending tickets. Draw needs paging; no tokens moved. Seed ${seedHash.slice(0, 16)} is committed.`,
      });
      return;
    }

    if (tickets.empty) {
      await openNextLotteryRound(round, cfg.seedPool, cfg.drawDayUtc, cfg.drawHourUtc, at);
      logger.info('[drawLottery] no tickets, rolled the round over', { round });
      return;
    }

    /* REVEAL. Deterministic from here down: sorted ids, seeded shuffle. */
    const byTicketId = new Map(tickets.docs.map((doc) => [str(doc.get('ticketId'), doc.id), doc]));
    const ordered = shuffle([...byTicketId.keys()].sort(), mulberry32(fnv1a(seed)));

    const winnerCount = Math.min(Math.max(1, Math.floor(cfg.winnersPerDraw)), ordered.length);
    const perWinner = Math.floor(pool / winnerCount);
    const winners: Array<{ uid: string; ticketId: string; prize: number }> = [];

    if (perWinner <= 0) {
      logger.error('[drawLottery] pool cannot pay a whole token per winner, nobody is paid', {
        round,
        pool,
        winnerCount,
      });
    }

    for (const ticketId of ordered.slice(0, perWinner > 0 ? winnerCount : 0)) {
      const doc = byTicketId.get(ticketId);
      if (!doc) continue;
      const uid = str(doc.get('uid'));
      if (!uid) continue;

      try {
        const result = await creditTokens({
          uid,
          source: 'lottery',
          amount: perWinner,
          label: `Lottery win — round ${round}`,
          refId: ticketId,
          idempotencyKey: `lotto_${round}_${ticketId}`,
          applyBonus: false,
          score: false,
        });

        await doc.ref.update({ status: 'Won', prize: perWinner, drawnAt: now() });
        winners.push({ uid, ticketId, prize: perWinner });

        if (!result.replayed) {
          await notify(uid, {
            icon: 'ticket',
            tone: 'violet',
            title: 'You won the lottery draw',
            body: `${perWinner.toLocaleString('en-US')} tokens from round ${round} have been credited.`,
            href: '/lottery',
          });
        }
      } catch (error) {
        /* The ticket stays Pending. It is not marked Lost either — a ticket that
           was drawn but could not be paid is a case for an operator, not a
           silent loss. */
        logger.error('[drawLottery] winner payout refused', { round, ticketId, uid, error });
      }
    }

    /* Everything not drawn loses, in batches so a large round stays inside the
       500-write limit. */
    const wonIds = new Set(winners.map((w) => w.ticketId));
    const losers = [...byTicketId.entries()].filter(([id]) => !wonIds.has(id));
    for (const page of chunk(losers, BATCH)) {
      const batch = db().batch();
      for (const [, doc] of page) batch.update(doc.ref, { status: 'Lost', drawnAt: now() });
      await batch.commit();
    }

    /* The draw record is keyed on the round, so a retry overwrites one record
       rather than appending a second history of the same event. */
    await db().doc(`lotteryDraws/${round}`).set({
      round,
      seed,
      seedHash,
      pool,
      perWinner,
      ticketCount: byTicketId.size,
      winners,
      drawnBy: SYSTEM_ACTOR,
      createdAt: now(),
      updatedAt: now(),
    });

    await openNextLotteryRound(round, cfg.seedPool, cfg.drawDayUtc, cfg.drawHourUtc, at);

    await audit({
      actorUid: SYSTEM_ACTOR,
      action: 'lottery.draw',
      target: round,
      detail: `${winners.length} winners × ${perWinner} tokens from a ${pool}-token pool over ${byTicketId.size} tickets. Seed ${seed}.`,
    });

    logger.info('[drawLottery] drawn', { round, winners: winners.length, perWinner });
  },
);

/** Open the round after `previous`. Called only once the draw record is durable:
    rotating first would leave the drawn tickets orphaned under a closed round
    with nothing to explain what happened to them. */
async function openNextLotteryRound(
  previous: string,
  seedPool: number,
  drawDayUtc: number,
  drawHourUtc: number,
  from: Date,
): Promise<void> {
  const next = `r${Number(previous.replace(/\D/g, '') || 1) + 1}`;
  await db().doc('lottery/current').set({
    round: next,
    pool: seedPool,
    totalTickets: 0,
    closed: false,
    seed: null,
    seedHash: null,
    drawsAt: Timestamp.fromDate(nextUtcWeekday(drawDayUtc, drawHourUtc, from)),
    createdAt: now(),
    updatedAt: now(),
  });
}

/* ============================================================================
   4. processDirectWithdrawalBatch  —  scheduled, every 6 hours
   ----------------------------------------------------------------------------
   FaucetPay and CWallet payouts settle through their own APIs in seconds and are
   handled inline by the withdraw Route Handler. DIRECT on-chain payouts are
   batched, because broadcasting twenty 0.0005 LTC transfers individually burns
   more in network fees than the withdrawals are worth.

   THIS FUNCTION DOES NOT SIGN AND DOES NOT BROADCAST, EVER
   A signing key in a Cloud Functions process is a signing key in every log line,
   every crash dump, every dependency in the tree and every future maintainer's
   local emulator. This job's entire responsibility is to decide the membership
   of a batch, mark it, and hand an operator a document they can act on from a
   machine that does hold the key. If a future version needs automation, it goes
   behind a custody API with its own IAM — not in here.

   THE ORDER, AND WHY THE MARK COMES FIRST
     1. Refuse to touch anything while lockdown is engaged or withdrawals are
        paused. A lockdown declared at 02:00 must not be undone by the 06:00 tick.
     2. Read the oldest Pending Direct withdrawals and group them by `network`.
        A batch is one chain; a multi-output transaction cannot span two.
     3. Assign a `batchId` and set `Processing` in ONE batched write per group,
        together with the `/payoutBatches/{batchId}` manifest. Marking before
        handing anything over is what makes the batch retryable: if this job dies
        after the commit, the rows are already claimed by a batch that exists.
     4. Stop. Log the batch and let the operator sign it.

   `Processing` IS A ONE-WAY DOOR
     Nothing here ever moves a row back to Pending. A reverted row would be
     picked up by the next tick and paid a second time, and the first payment may
     already be confirming on chain. A batch that turns out to be wrong is
     resolved forward — Completed with a txid, or Failed with a refund — by the
     admin Route Handler, never by rewinding.

   IDEMPOTENCY
     `batchId` is derived from the network and the run's UTC hour, so a retried
     invocation in the same window re-marks the same rows into the same batch and
     rewrites the same manifest. The query only matches `Pending`, so rows
     already marked are invisible to the next run.
   ========================================================================== */
export const processDirectWithdrawalBatch = onSchedule(
  { schedule: 'every 6 hours', timeZone: 'Etc/UTC', retryCount: 1, timeoutSeconds: 300 },
  async (event: ScheduledEvent): Promise<void> => {
    const [flags, lockdown, usdPerToken] = await Promise.all([
      readSiteFlags(),
      isLockedDown(),
      readUsdPerToken(),
    ]);

    if (lockdown || !flags.withdrawalsOpen) {
      logger.warn('[processDirectWithdrawalBatch] money movement is paused, no batch built', {
        lockdown,
        withdrawalsOpen: flags.withdrawalsOpen,
      });
      return;
    }

    const at = scheduledAt(event);
    const pending = await db()
      .collection('withdrawals')
      .where('status', '==', 'Pending')
      .where('rail', '==', 'Direct')
      .orderBy('createdAt', 'asc')
      .limit(300)
      .get();

    if (pending.empty) return;

    const groups = new Map<string, typeof pending.docs>();
    for (const doc of pending.docs) {
      const network = str(doc.get('network'), 'unknown');
      const bucket = groups.get(network);
      if (bucket) bucket.push(doc);
      else groups.set(network, [doc]);
    }

    const window = `${dayKey(at)}-${String(at.getUTCHours()).padStart(2, '0')}`;

    for (const [network, docs] of groups) {
      const slug = network.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'unknown';
      const batchId = `${slug}-${window}`;
      const tokenCost = docs.reduce((sum, doc) => sum + int(doc.get('tokenCost')), 0);

      const batch = db().batch();
      for (const doc of docs) {
        batch.update(doc.ref, { status: 'Processing', batchId, updatedAt: now() });
      }

      batch.set(
        db().doc(`payoutBatches/${batchId}`),
        {
          batchId,
          rail: 'Direct',
          network,
          /* Not "Processing": the withdrawals are claimed, the transaction does
             not exist yet. An operator reading this queue needs to know which of
             those two states they are looking at. */
          status: 'AwaitingSignature',
          count: docs.length,
          tokenCost,
          usdValue: (tokenCost * usdPerToken).toFixed(4),
          withdrawalIds: docs.map((doc) => doc.id),
          outputs: docs.map((doc) => ({
            id: doc.id,
            address: str(doc.get('address')),
            coin: str(doc.get('coin')),
            amount: str(doc.get('receiveAmount'), str(doc.get('amount'), '0')),
          })),
          createdAt: now(),
          updatedAt: now(),
        },
        { merge: true },
      );

      batch.set(
        auditRef(),
        auditDoc({
          actorUid: SYSTEM_ACTOR,
          action: 'withdrawal.batch',
          target: batchId,
          detail: `${docs.length} Direct ${network} payout(s), ${tokenCost} tokens, marked Processing and awaiting signature.`,
        }),
      );

      await batch.commit();

      logger.info('[processDirectWithdrawalBatch] batch built, awaiting an operator', {
        batchId,
        network,
        count: docs.length,
        tokenCost,
      });
    }
  },
);

/* ============================================================================
   5. expireSuspensions  —  scheduled, hourly
   ----------------------------------------------------------------------------
   Restores every account whose `suspendedUntil` has passed.

   The web app also lifts an expired suspension lazily, on read
   (`../src/server/users.ts#liftExpiredSuspension`), which covers the user who
   comes back and tries. This job covers the one who does not: a suspension that
   only ends when the suspended person visits is a suspension that silently
   becomes permanent for anybody who gave up, and their balance is still ours to
   pay.

   THE AUDIT ROW IS NOT OPTIONAL. It rides in the same batch as the restore, with
   `actorUid: 'system'`. An account that un-suspends itself with no record is
   indistinguishable from one that was never suspended, and the ban-evasion
   investigation six weeks later needs exactly that difference.

   DELIBERATELY NOT DONE HERE: lifting a ban. Bans have no expiry by design, and
   an automatic path that reversed one would quietly make the word untrue.

   IDEMPOTENCY: the query matches only accounts still flagged `suspended`, so a
   second run in the same hour matches nothing.
   ========================================================================== */
export const expireSuspensions = onSchedule(
  { schedule: '0 * * * *', timeZone: 'Etc/UTC', retryCount: 1, timeoutSeconds: 300 },
  async (): Promise<void> => {
    const cutoff = Timestamp.now();
    const due = await db()
      .collection('users')
      .where('suspended', '==', true)
      .where('suspendedUntil', '<=', cutoff)
      .limit(300)
      .get();

    if (due.empty) return;

    /* THE GUARD THAT KEEPS A BAN A BAN. Firestore orders by type before it orders
       by value, so a `<= Timestamp` filter also matches rows where the field is
       null — and `suspendedUntil: null` is precisely how a permanent suspension
       is stored. Without this line the hourly sweep would quietly lift every ban
       in the project. */
    const expired = due.docs.filter((doc) => {
      const until = millis(doc.get('suspendedUntil'));
      return until > 0 && until <= cutoff.toMillis();
    });

    if (!expired.length) return;

    /* Three writes per user — restore, notification, audit — so the page size
       has to stay under a third of the 500-write batch limit. */
    for (const page of chunk(expired, 150)) {
      const batch = db().batch();

      for (const doc of page) {
        batch.update(doc.ref, {
          suspended: false,
          suspendedReason: null,
          suspendedUntil: null,
          updatedAt: now(),
        });

        batch.set(
          doc.ref.collection('notifications').doc(),
          notificationDoc({
            icon: 'checkCircle',
            tone: 'success',
            title: 'Your account is active again',
            body: 'The suspension has expired. Earning and withdrawals are open.',
            href: '/dashboard',
          }),
        );

        batch.set(
          auditRef(),
          auditDoc({
            actorUid: SYSTEM_ACTOR,
            action: 'user.suspension.expired',
            target: doc.id,
            detail: `Suspension expired and was lifted automatically. Reason on record: ${
              str(doc.get('suspendedReason')) || 'none given'
            }.`,
          }),
        );
      }

      await batch.commit();
    }

    logger.info('[expireSuspensions] lifted', { count: expired.length, matched: due.size });
  },
);

/* ============================================================================
   6. sweepStreaks  —  scheduled, daily 00:10 UTC
   ----------------------------------------------------------------------------
   Zeroes the daily-bonus streak of anybody who has not claimed within
   `economy.daily.breakAfterHours`, and recomputes `earningBonusBps` with the
   same formula the web app uses:

       min(maxBonusBps, level × bonusBpsPerLevel + streak × bonusBpsPerStreakDay)

   The formula lives in `./config` next to a note that it must match
   `../src/lib/config/economy.ts`. If the two ever disagree, this job hands the
   user a different bonus from the one the UI showed them before their next
   claim, and the ledger row will disagree with the screen that produced it.

   00:10 rather than 00:00 to stay clear of the claim spike at midnight.

   WHY IT PAGES OVER EVERY USER INSTEAD OF QUERYING THE STALE ONES
   The natural query — `streakDays > 0 AND lastStreakClaimAt < cutoff` — is two
   inequalities on two fields, and the index and ordering constraints that come
   with it are not worth the coupling. Worse, Firestore's cross-type ordering
   makes a range filter over a field that is sometimes `null` a subtle question,
   and `lastStreakClaimAt` is null for every user who has never claimed. So this
   pages the collection by document id with a projection of three fields, filters
   in memory, and writes only where there is something to change.

   RESUMABLE, WHICH IS THE POINT
   The cursor lives in `/jobs/sweepStreaks` and is persisted after every page. A
   timeout resumes at the next document instead of restarting at the top — which
   is how a sweep over a large collection converges at all rather than
   re-scanning the same first pages forever. When a run reaches the end it clears
   the cursor and stamps `completedDay`, and a second invocation on a day that
   already completed returns immediately.
   ========================================================================== */
export const sweepStreaks = onSchedule(
  { schedule: '10 0 * * *', timeZone: 'Etc/UTC', retryCount: 1, timeoutSeconds: 540 },
  async (event: ScheduledEvent): Promise<void> => {
    const economy = await readEconomy();
    const cutoff = Date.now() - Math.max(1, economy.daily.breakAfterHours) * 3_600_000;
    const day = dayKey(scheduledAt(event));

    const jobRef = db().doc('jobs/sweepStreaks');
    const job = await jobRef.get();
    let cursor = str(job.get('cursor')) || null;

    if (!cursor && str(job.get('completedDay')) === day) {
      logger.info('[sweepStreaks] already completed for this day', { day });
      return;
    }

    const budget = new Budget(470, 8000);
    const PAGE = 400;
    let scanned = 0;
    let cleared = 0;
    let finished = false;

    while (budget.ok()) {
      let query = db()
        .collection('users')
        .orderBy(FieldPath.documentId())
        .select('streakDays', 'lastStreakClaimAt', 'level')
        .limit(PAGE);
      if (cursor) query = query.startAfter(cursor);

      const page = await query.get();
      if (page.empty) {
        finished = true;
        break;
      }

      const batch = db().batch();
      let writes = 0;

      for (const doc of page.docs) {
        scanned += 1;
        cursor = doc.id;

        const streak = int(doc.get('streakDays'));
        if (streak <= 0) continue;

        /* `millis` returns 0 for a missing timestamp, which reads as
           "infinitely long ago" — the right answer for a user carrying a streak
           with no claim behind it. */
        if (millis(doc.get('lastStreakClaimAt')) > cutoff) continue;

        batch.update(doc.ref, {
          streakDays: 0,
          earningBonusBps: earningBonusBps(int(doc.get('level'), 1), 0, economy.levels),
          streakBrokenAt: now(),
          updatedAt: now(),
        });
        writes += 1;
        cleared += 1;
      }

      if (writes) {
        await batch.commit();
        budget.spend(writes);
      }

      /* Persisted per page, not per run: the cursor is only useful if it
         survives the timeout it exists to protect against. */
      await jobRef.set({ cursor, day, lastRunAt: now(), updatedAt: now() }, { merge: true });

      if (page.size < PAGE) {
        finished = true;
        break;
      }
    }

    await jobRef.set(
      {
        cursor: finished ? null : cursor,
        day,
        scanned,
        cleared,
        lastRunAt: now(),
        ...(finished ? { completedDay: day, completedAt: now() } : {}),
        updatedAt: now(),
      },
      { merge: true },
    );

    logger.info('[sweepStreaks] pass complete', { day, scanned, cleared, finished });
  },
);

/* ============================================================================
   7. refreshRates  —  scheduled, every 30 minutes
   ----------------------------------------------------------------------------
   Pulls USD spot for the twelve payable assets from CoinGecko's free
   `/api/v3/simple/price` and merges the result into `/config/rates.spot`.

   WHAT IT MUST NOT TOUCH
     `usdPerToken`  the price of the product's own token. Operator-owned, and the
                    single number that decides how much crypto a balance buys.
     `rails`        per-asset minimums, fees and enablement. Operator-owned.
   `set({ spot }, { merge: true })` writes exactly one key, which is why the
   merge is spelled that way rather than as a whole-document write.

   ON FAILURE IT WRITES NOTHING. Not a zero, not a partial map, not a retry with
   defaults. A stale price quotes a withdrawal slightly wrong. A zero price makes
   `usdValue / spot` unbounded and lets one withdrawal drain the treasury. Those
   two outcomes are not on the same scale, so the failure path is `return`.

   TWO SANITY GATES ON EVERY PRICE
     1. Finite and strictly positive, or the previous value is kept.
     2. No more than a 60% move since the last stored value. A real 60% move in
        thirty minutes happens; a provider returning a price in the wrong unit,
        or a decimal-shifted memecoin quote, happens more often. Keeping the old
        number and logging loudly is recoverable in either case — the operator
        can force the update from the console once they have looked.
   If every price is rejected the document is left alone entirely.
   ========================================================================== */

/** CoinGecko ids for the twelve payable tickers. Verified against the live
    `/simple/price` response; an id that stops resolving silently drops that
    asset's price rather than failing the run, and the log names it. */
const COINGECKO_IDS: Record<CoinTicker, string> = {
  BTC: 'bitcoin',
  LTC: 'litecoin',
  TRX: 'tron',
  SOL: 'solana',
  DOGE: 'dogecoin',
  USDT: 'tether',
  TON: 'the-open-network',
  PEPE: 'pepe',
  SHIB: 'shiba-inu',
  FLOKI: 'floki',
  BONK: 'bonk',
  BNB: 'binancecoin',
};

/** 60%, in basis points. See gate 2 above. */
const MAX_MOVE_BPS = 6_000;

export const refreshRates = onSchedule(
  { schedule: 'every 30 minutes', timeZone: 'Etc/UTC', retryCount: 1, timeoutSeconds: 60 },
  async (): Promise<void> => {
    const ids = Object.values(COINGECKO_IDS).join(',');
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`;
    const apiKey = str(process.env.COINGECKO_API_KEY).trim();

    let payload: Record<string, { usd?: number } | undefined>;
    try {
      /* An explicit abort: a scheduled job that hangs on a third-party socket
         holds an instance for the whole timeout and overlaps the next tick. */
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          ...(apiKey ? { 'x-cg-demo-api-key': apiKey } : {}),
        },
      });
      clearTimeout(timer);

      if (!response.ok) throw new Error(`coingecko responded ${response.status}`);
      payload = (await response.json()) as Record<string, { usd?: number } | undefined>;
    } catch (error) {
      logger.error('[refreshRates] fetch failed, /config/rates left untouched', { error });
      return;
    }

    const ratesRef = db().doc('config/rates');
    const snap = await ratesRef.get();
    const stored = (snap.exists ? snap.get('spot') : null) as Record<string, unknown> | null;

    const spot: Record<string, number> = {};
    const rejected: string[] = [];
    let accepted = 0;

    for (const [ticker, id] of Object.entries(COINGECKO_IDS) as Array<[CoinTicker, string]>) {
      const prior = num(stored?.[ticker], DEFAULT_SPOT[ticker]);
      const next = num(payload[id]?.usd, 0);

      if (!(next > 0)) {
        rejected.push(`${ticker}:missing`);
        spot[ticker] = prior;
        continue;
      }

      if (prior > 0 && (Math.abs(next - prior) / prior) * 10_000 > MAX_MOVE_BPS) {
        rejected.push(`${ticker}:${prior}→${next}`);
        spot[ticker] = prior;
        continue;
      }

      spot[ticker] = next;
      accepted += 1;
    }

    if (rejected.length) {
      logger.error('[refreshRates] prices rejected and previous values kept', { rejected });
    }

    if (!accepted) {
      logger.error('[refreshRates] every price was rejected, nothing written');
      return;
    }

    await ratesRef.set(
      { spot, spotSource: 'coingecko', spotFetchedAt: now(), updatedAt: now() },
      { merge: true },
    );

    logger.info('[refreshRates] spot updated', { accepted, rejected: rejected.length });
  },
);

/* ============================================================================
   8. rollupDailyStats  —  scheduled, daily 00:05 UTC
   ----------------------------------------------------------------------------
   Two jobs, both about making the numbers on the admin charts honest.

   A ZERO ROW, NOT A GAP. `/stats/daily/days/{day}` is created by the first
   counter bump of the day, so a day with no activity has no document at all —
   and `getDailySeries` reads the last 30 documents by `day` desc, which means a
   quiet Tuesday does not appear as zero, it disappears and Wednesday slides into
   its place. A chart that silently compresses its own x-axis is worse than an
   empty one. This ensures yesterday's row exists, and today's, so the series is
   contiguous from the moment the chart is drawn.

   RECONCILE `members`. Every other counter in `/stats/global` is an increment
   from the write path that produced it and can only drift downward-safe: a
   dropped bump loses a claim from a total. `members` is the one an operator
   quotes publicly, so once a day it is replaced with a `count()` aggregate over
   `/users` — one aggregate query, billed per 1000 documents matched, which is
   the cheapest true answer available.

   IDEMPOTENCY: creating a row only when it is missing, and a count that is
   replaced rather than incremented. Running this twice changes nothing.
   ========================================================================== */
export const rollupDailyStats = onSchedule(
  { schedule: '5 0 * * *', timeZone: 'Etc/UTC', retryCount: 2, timeoutSeconds: 300 },
  async (event: ScheduledEvent): Promise<void> => {
    const at = scheduledAt(event);
    const today = dayKey(at);
    const yesterday = dayKey(new Date(at.getTime() - 86_400_000));

    /* Every counter `bumpStat` can increment, at zero. A missing key and a zero
       key render differently in the charts. */
    const ZERO = {
      members: 0,
      membersToday: 0,
      claims: 0,
      tokensCredited: 0,
      withdrawals: 0,
      tokensWithdrawn: 0,
      usdWithdrawn: 0,
      ptcViews: 0,
      shortlinkClaims: 0,
      offerwallConversions: 0,
      adImpressions: 0,
    };

    for (const day of [yesterday, today]) {
      const ref = db().doc(`stats/daily/days/${day}`);
      const snap = await ref.get();
      if (!snap.exists) {
        await ref.set({ ...ZERO, day, createdAt: now(), updatedAt: now() });
      }
    }

    const counted = await db().collection('users').count().get();
    const members = int(counted.data().count);

    await db()
      .doc('stats/global')
      .set({ members, membersReconciledAt: now(), updatedAt: now() }, { merge: true });

    logger.info('[rollupDailyStats] rows ensured and members reconciled', {
      yesterday,
      today,
      members,
    });
  },
);

/* ============================================================================
   9. cleanupEphemeral  —  scheduled, hourly
   ----------------------------------------------------------------------------
   Deletes the two short-lived collections that exist only to make a single
   request replay-proof:

     /captchaTokens/{hash}              a solved captcha, spent once
     /users/{uid}/taskSessions/{token}  an issued PTC or shortlink session

   Both carry `expiresAt`, and both are checked on read, so an expired document is
   already useless before this job touches it. The deletion is about cost and
   about the collection-group query over `taskSessions` staying fast, not about
   correctness — which is exactly why it is safe to cap and safe to stop early.

   THE REAL FIX IS A TTL POLICY. Firestore can delete by `expiresAt` natively,
   for free, with no function invocation and no write budget. Configure both TTL
   policies (see the operator notes at the bottom of this file) and this job
   becomes the belt to that pair of braces: it will find nothing, cost one empty
   query per hour, and still catch documents written before the policies existed
   or during a period when TTL was disabled.

   BOUNDED: `deleteMatching` pages at 400 and stops on the shared write and clock
   budget. Whatever it does not reach this hour, it reaches next hour.
   ========================================================================== */
export const cleanupEphemeral = onSchedule(
  { schedule: '0 * * * *', timeZone: 'Etc/UTC', retryCount: 0, timeoutSeconds: 300 },
  async (): Promise<void> => {
    const cutoff = Timestamp.now();
    const budget = new Budget(240, 4000);
    /* Only rows with a real expiry in the past. See `deleteMatching`. */
    const expired = (doc: QueryDocumentSnapshot): boolean => {
      const at = millis(doc.get('expiresAt'));
      return at > 0 && at <= cutoff.toMillis();
    };

    const captcha = await deleteMatching(
      db().collection('captchaTokens').where('expiresAt', '<=', cutoff),
      budget,
      expired,
    );

    /* A collection-group query: task sessions live under each user, and there is
       no other way to sweep them without reading every user document first. */
    const sessions = await deleteMatching(
      db().collectionGroup('taskSessions').where('expiresAt', '<=', cutoff),
      budget,
      expired,
    );

    if (captcha || sessions) {
      logger.info('[cleanupEphemeral] deleted', { captchaTokens: captcha, taskSessions: sessions });
    }
  },
);

/* ============================================================================
   10. escalateStaleChats  —  scheduled, every 30 minutes
   ----------------------------------------------------------------------------
   Turns an abandoned AI conversation into a real support ticket, so the chat
   panel and the Support page are one system rather than two places a user has to
   repeat themselves.

   WHAT COUNTS AS STALE
     `/chats/{uid}` with `mode == 'ai'`, `lastMessageAt` older than 30 minutes,
     and `resolved != true`. The `resolved` test is done in memory: a `!=` filter
     in Firestore excludes documents where the field is absent, and "the field was
     never written" is the normal state for a conversation nobody resolved — the
     exact set this job exists to find.

   WHAT IT WRITES, IN ONE BATCH
     A `/tickets/{id}` with the transcript as its first message, `sourceChatUid`
     pointing back at the chat, and `unreadForSupport: true` so it lands in the
     agent queue; `escalatedTicketId` on the chat so the panel can link the two;
     `mode: 'queue'` so the panel stops pretending an assistant is still
     answering; and a notification so the user learns a human now has it.

   One batch, because a ticket with no transcript, or a chat pointing at a ticket
   that does not exist, are both worse than not escalating at all.

   IDEMPOTENCY: `escalatedTicketId` is the marker. A chat that has one is skipped,
   so a retry cannot open a second ticket for the same conversation.
   ========================================================================== */
export const escalateStaleChats = onSchedule(
  { schedule: 'every 30 minutes', timeZone: 'Etc/UTC', retryCount: 0, timeoutSeconds: 300 },
  async (): Promise<void> => {
    const cutoff = Timestamp.fromMillis(Date.now() - 30 * 60_000);
    const stale = await db()
      .collection('chats')
      .where('mode', '==', 'ai')
      .where('lastMessageAt', '<=', cutoff)
      .limit(50)
      .get();

    if (stale.empty) return;

    const budget = new Budget(240, 1000);
    let escalated = 0;

    for (const chat of stale.docs) {
      if (!budget.ok()) break;
      if (bool(chat.get('resolved'))) continue;
      if (str(chat.get('escalatedTicketId'))) continue;

      /* Same cross-type trap as the suspension sweep: a `<= Timestamp` filter
         matches a null `lastMessageAt` too, and a chat with no messages timestamp
         is not a stale chat, it is an empty one. */
      const lastMessageMs = millis(chat.get('lastMessageAt'));
      if (lastMessageMs <= 0 || lastMessageMs > cutoff.toMillis()) continue;

      const uid = str(chat.get('uid'), chat.id);
      const messages = await db()
        .collection(`chats/${chat.id}/messages`)
        .orderBy('createdAt', 'asc')
        .limit(50)
        .get();

      /* Nothing was ever said. There is no ticket to write and no complaint to
         escalate; leaving the chat alone is the honest outcome. */
      if (messages.empty) continue;

      const userSnap = await db().doc(`users/${uid}`).get();
      const username = str(userSnap.get('username'), 'member');

      const firstFromUser = messages.docs.find((doc) => str(doc.get('from'), 'user') === 'user');
      const subject =
        str(firstFromUser?.get('body')).trim().slice(0, 90) || 'Unanswered assistant chat';

      const transcript = messages.docs
        .map((doc) => {
          const from = str(doc.get('from'), 'user');
          const who = from === 'user' ? username : from === 'ai' ? 'Assistant' : 'Support';
          return `${who}: ${str(doc.get('body')).trim()}`;
        })
        .join('\n\n');

      const ticketRef = db().collection('tickets').doc();
      const batch = db().batch();

      batch.set(ticketRef, {
        uid,
        username,
        subject,
        /* The chat carries no category. 'Other' is honest; an inferred category
           that is wrong routes the ticket to the wrong queue and costs the user
           another cycle. */
        category: 'Other',
        status: 'Open',
        lastMessagePreview: transcript.slice(0, 140),
        lastMessageAt: now(),
        unreadForUser: false,
        unreadForSupport: true,
        assignedTo: null,
        sourceChatUid: chat.id,
        createdAt: now(),
        updatedAt: now(),
      });

      batch.set(ticketRef.collection('messages').doc(), {
        authorUid: uid,
        authorRole: 'user',
        authorName: username,
        body: transcript,
        attachments: [],
        createdAt: now(),
      });

      batch.update(chat.ref, {
        escalatedTicketId: ticketRef.id,
        mode: 'queue',
        escalatedAt: now(),
        updatedAt: now(),
      });

      batch.set(
        db().collection(`users/${uid}/notifications`).doc(),
        notificationDoc({
          icon: 'ticket',
          tone: 'info',
          title: 'Your chat is with the support team',
          body: 'The assistant could not finish this one, so it has been passed to a person along with the conversation.',
          href: '/support',
        }),
      );

      await batch.commit();
      budget.spend(4);
      escalated += 1;
    }

    if (escalated) logger.info('[escalateStaleChats] escalated', { escalated });
  },
);

/* ============================================================================
   11. onUserLevelChange  —  Firestore trigger on /users/{uid}
   ----------------------------------------------------------------------------
   Marks a referral as qualified the moment it reaches the qualifying level, pays
   the referrer the one-off bonus, and promotes their tier.

   THE FIRST THING IT DOES IS DECIDE IT HAS NOTHING TO DO
   This trigger fires on EVERY write to a user document — every faucet claim,
   every PTC view, every `lastSeenAt` touch, every write this very handler makes.
   At faucet traffic that is the highest-volume function in the project by an
   order of magnitude, so the guard is three field comparisons on data already in
   memory, before any Firestore read:

       level did not increase        → return
       no referrer, or self-referral → return
       below the qualifying level    → return

   Only past those does it read the config, and only past the config does it touch
   a document.

   WHY A TRIGGER AND NOT PART OF THE CREDIT PATH
   A level-up can come from a faucet claim, a PTC view, an offerwall postback, an
   admin adjustment or a coupon — six Route Handlers, and each one forgetting this
   is a referrer who never gets paid. A trigger on the field that actually changed
   is one implementation instead of six.

   IDEMPOTENCY, AND WHY IT SPANS TWO CODE BASES
   The bonus uses claim id `refqual_${uid}` — byte for byte the key
   `../src/server/social.ts#qualifyReferral` uses. The web app calls that function
   after a credit that levels somebody up, and this trigger fires on the same
   write. Both will try. The shared key is what makes the second one a no-op
   instead of a second payment.

   LOOP SAFETY
   Everything this handler writes leaves `level` untouched: the edge document is
   in another collection, and the referrer's `referralQualified`, `referralTier`
   and `commissionBps` writes re-enter this function and hit the first guard. The
   bonus credit does move the referrer's `totalEarned`, and also does not move
   their level, because it carries no EXP.
   ========================================================================== */
export const onUserLevelChange = onDocumentUpdated(
  { document: 'users/{uid}', retry: false },
  async (event): Promise<void> => {
    const before = event.data?.before;
    const after = event.data?.after;
    if (!before || !after) return;

    if (int(after.get('level'), 1) <= int(before.get('level'), 1)) return;

    const uid = event.params.uid;
    const referrer = str(after.get('referredBy'));
    if (!referrer || referrer === uid) return;

    const level = int(after.get('level'), 1);
    const economy = await readEconomy();
    if (level < economy.referrals.qualifyingLevel) return;

    const edgeRef = db().doc(`referrals/${referrer}/list/${uid}`);
    const referrerRef = db().doc(`users/${referrer}`);

    const edge = await edgeRef.get();
    /* No edge means the referral was never recorded in the tree — a `referredBy`
       written by hand, or a signup whose transaction half-failed. Creating the
       edge here would invent a referral date and a join country, so it is left
       for the referral reconciliation to fix with real data. */
    if (!edge.exists) {
      logger.warn('[onUserLevelChange] referredBy with no referral edge', { uid, referrer });
      return;
    }

    /* Already qualified: keep the denormalised level fresh so the referrals table
       does not show a level from the day they joined, and stop. */
    if (bool(edge.get('qualified'))) {
      await edgeRef.update({ level, lastActiveAt: now(), updatedAt: now() });
      return;
    }

    /* The flip and the count move together. Two concurrent level-ups both read
       `qualified: false` above; the transaction re-reads it, so only one wins and
       the count cannot be incremented twice for one referral. */
    const qualifiedNow = await db().runTransaction<boolean>(async (tx) => {
      const [edgeSnap, referrerSnap] = await Promise.all([tx.get(edgeRef), tx.get(referrerRef)]);
      if (!edgeSnap.exists || !referrerSnap.exists) return false;
      if (bool(edgeSnap.get('qualified'))) return false;

      tx.update(edgeRef, {
        qualified: true,
        level,
        username: str(after.get('username'), str(edgeSnap.get('username'), 'member')),
        countryCode: str(after.get('countryCode'), str(edgeSnap.get('countryCode'), 'XX')),
        qualifiedAt: now(),
        lastActiveAt: now(),
        updatedAt: now(),
      });

      tx.update(referrerRef, { referralQualified: FieldValue.increment(1), updatedAt: now() });
      return true;
    });

    if (!qualifiedNow) return;

    const bonus = Math.max(0, Math.floor(economy.referrals.qualifyBonusTokens));
    if (bonus > 0) {
      try {
        await creditTokens({
          uid: referrer,
          source: 'referral',
          amount: bonus,
          label: `Referral reached level ${economy.referrals.qualifyingLevel}`,
          refId: uid,
          idempotencyKey: `refqual_${uid}`,
          applyBonus: false,
        });
      } catch (error) {
        /* The qualification stands. A suspended or deleted referrer must not
           block the count, and the bonus is recoverable from the audit trail. */
        logger.error('[onUserLevelChange] qualify bonus refused', { referrer, uid, error });
      }
    }

    /* Tier is COMPUTED from the qualified count, never incremented alongside it.
       An increment drifts the moment one write is lost; a recompute cannot. */
    const fresh = await referrerRef.get();
    const { tier, rate } = tierForCount(int(fresh.get('referralQualified')), economy.referrals);
    const priorTier = str(fresh.get('referralTier'));

    await referrerRef.update({
      referralTier: tier,
      commissionBps: rate * 100,
      updatedAt: now(),
    });

    await notify(referrer, {
      icon: 'users',
      tone: 'mint',
      title: priorTier && priorTier !== tier ? `${tier} tier unlocked` : 'A referral qualified',
      body:
        bonus > 0
          ? `${bonus.toLocaleString('en-US')} tokens credited. Your commission is now ${rate}%.`
          : `Your commission is now ${rate}%.`,
      href: '/referrals',
    });
  },
);

/* ============================================================================
   12. setStaffRole  —  callable, THE ONLY ONE IN THIS FILE
   ----------------------------------------------------------------------------
   Grants or changes a staff role: `setCustomUserClaims(uid, { role, perms?, mfa })`.

   WHY THIS ONE IS NOT A ROUTE HANDLER LIKE THE OTHER THIRTEEN
   A Route Handler could call `setCustomUserClaims` — it has the Admin SDK too.
   What it cannot do is exist before the first super_admin does. `requireAdmin()`
   in the admin console refuses every caller without a staff claim, and the only
   thing that can mint a staff claim is this operation. Somebody has to be able to
   go first, and a bootstrap that lives in the console is a bootstrap that has to
   trust the console's own authorisation to be bypassable — which is a hole that
   stays open forever.

   THE ESCAPE HATCH, STATED PLAINLY
   When `/staff` contains no super_admin, a caller whose VERIFIED token email
   exactly equals `BOOTSTRAP_ADMIN_EMAIL` may grant a role — including granting
   themselves super_admin, which is the entire point. The moment one super_admin
   exists the hatch closes: the query below is re-run on every call, so it cannot
   be re-opened by unsetting anything, only by deleting the last super_admin from
   `/staff`. Leave `BOOTSTRAP_ADMIN_EMAIL` unset in production once the first
   admin exists; the env var is only half the gate, but it is the half an operator
   controls.

   GUARDS, IN THIS ORDER
     1. Authenticated at all.
     2. Caller holds `super_admin`, or the bootstrap conditions above hold.
        Authorisation BEFORE argument parsing: a malformed-argument error handed
        to an unauthorised caller is a free oracle for what the endpoint expects.
     3. Caller is not the target — except while bootstrapping. A super_admin
        cannot demote themselves into a corner, and a compromised account cannot
        quietly re-badge itself as Support in the staff table while keeping its
        claims.
     4. `role` is one of the five. `perms` are strings, deduplicated, capped at 24
        because custom claims are limited to 1000 bytes in total and the answer to
        needing more is a new role, not a longer list.
     5. `reason` is non-empty. A role change with no stated reason is
        indistinguishable from an attack after the fact.

   EFFECTS, IN THIS ORDER
     setCustomUserClaims → mirror `/staff/{uid}` → revokeRefreshTokens → audit.
     The revoke comes AFTER the claims are set, because revoking first would leave
     a window in which the target re-authenticates and picks up the old role. It
     is what makes a demotion effective now rather than within the token's
     remaining hour: `verifySessionCookie(cookie, true)` in the web guard checks
     revocation on every request.

   IDEMPOTENCY: setting the same role twice is a no-op plus a second audit row,
   which is correct — the second attempt happened and belongs in the record.
   ========================================================================== */

/** The five staff roles. Mirrors `AdminRole` in `../src/lib/admin/rbac.ts`; the
    duplication is the same tsconfig boundary as everything else in this bundle. */
const STAFF_ROLES = ['super_admin', 'admin', 'finance', 'moderator', 'support'] as const;
type StaffRole = (typeof STAFF_ROLES)[number];

/** Custom claims are capped at 1000 bytes across the whole object. A permission
    id averages ~18 bytes with JSON quoting, so 24 leaves room for role and mfa. */
const MAX_PERM_CLAIMS = 24;

const isStaffRole = (value: unknown): value is StaffRole =>
  typeof value === 'string' && (STAFF_ROLES as readonly string[]).includes(value);

interface SetStaffRoleRequest {
  uid: string;
  role: string;
  perms?: string[];
  reason: string;
}

export const setStaffRole = onCall<SetStaffRoleRequest>(
  { enforceAppCheck: false, timeoutSeconds: 60 },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');

    const callerUid = request.auth.uid;
    const callerRole = str(request.auth.token['role']);
    const callerEmail = str(request.auth.token.email).toLowerCase();

    let bootstrap = false;
    if (callerRole !== 'super_admin') {
      const superAdmins = await db()
        .collection('staff')
        .where('role', '==', 'super_admin')
        .limit(1)
        .get();

      const allowed = str(process.env.BOOTSTRAP_ADMIN_EMAIL).trim().toLowerCase();
      bootstrap =
        superAdmins.empty &&
        allowed.length > 0 &&
        callerEmail.length > 0 &&
        callerEmail === allowed &&
        request.auth.token.email_verified === true;

      if (!bootstrap) {
        /* `permission-denied` and nothing else. Never `not-found`: a refused
           caller should learn that they were refused and nothing about whether
           the target, or the bootstrap window, exists. */
        throw new HttpsError('permission-denied', 'Only a Super Admin can change a staff role.');
      }

      logger.warn('[setStaffRole] bootstrap grant — no super_admin exists yet', {
        caller: callerUid,
        email: callerEmail,
      });
    }

    const uid = str(request.data?.uid).trim();
    const role = request.data?.role;
    const reason = str(request.data?.reason).trim();

    if (!uid || uid.length > 128) throw new HttpsError('invalid-argument', 'Give a target uid.');
    if (!isStaffRole(role)) {
      throw new HttpsError(
        'invalid-argument',
        `Role must be one of ${STAFF_ROLES.join(', ')}.`,
      );
    }
    if (!reason) {
      throw new HttpsError('invalid-argument', 'A reason is required — it goes into the audit log.');
    }
    if (!bootstrap && uid === callerUid) {
      throw new HttpsError('permission-denied', 'You cannot change your own role.');
    }

    const perms = [...new Set((request.data?.perms ?? []).filter((p) => typeof p === 'string' && p))]
      .slice(0, MAX_PERM_CLAIMS)
      .sort();

    const target = await auth()
      .getUser(uid)
      .catch(() => null);
    if (!target) throw new HttpsError('not-found', 'No account with that uid.');

    const previousRole = str(
      (target.customClaims as Record<string, unknown> | undefined)?.['role'],
      'none',
    );

    await auth().setCustomUserClaims(uid, {
      role,
      ...(perms.length ? { perms } : {}),
      /* Hardcoded true, matching `buildAdminClaims` in the web app. Staff MFA is
         mandatory and the web guard treats a staff token without this claim as
         not-staff, so a caller must never be able to switch it off from here. */
      mfa: true,
    });

    await db()
      .doc(`staff/${uid}`)
      .set(
        {
          uid,
          email: target.email ?? null,
          name: str(target.displayName) || target.email?.split('@')[0] || uid,
          role,
          perms: perms.length ? perms : null,
          mfa: true,
          updatedAt: now(),
          updatedBy: bootstrap ? `bootstrap:${callerEmail}` : callerUid,
        },
        { merge: true },
      );

    await auth().revokeRefreshTokens(uid);

    await audit({
      actorUid: bootstrap ? SYSTEM_ACTOR : callerUid,
      actorName: bootstrap ? `bootstrap:${callerEmail}` : callerEmail || callerUid,
      action: 'roles.edit',
      target: `staff/${uid}`,
      detail: `role ${previousRole} → ${role}${perms.length ? ` · perms ${perms.join(',')}` : ''} · ${reason}`,
    });

    return { uid, role, previousRole, perms, bootstrap };
  },
);

/* ============================================================================
   DELETED FROM THIS FILE — and where the behaviour lives now
   ----------------------------------------------------------------------------
   Every one of these was a callable duplicating a path that now runs in a Next.js
   Route Handler on the Admin SDK. They are listed so nobody re-adds one, and so
   the next reader does not go looking for them in the git history.

     validateAndQueueWithdrawal   ../src/server/withdraw.ts#requestWithdrawal
     adminAdjustBalance           ../src/server/admin.ts (balance.adjust)
     adminApproveWithdrawal       ../src/server/admin.ts (withdrawal.approve)
     adminRejectWithdrawal        ../src/server/admin.ts (withdrawal.reject)
     adminBatchApprove            ../src/server/admin.ts (withdrawal.batch)
     adminReverseWithdrawal       ../src/server/admin.ts (withdrawal.reverse)
     creditOfferwallPostback      ../src/server/earn/offerwall.ts (route handler,
                                  signature-verified, keyed on the provider's
                                  conversion id)
     recreditOfferwallPostback    same module, admin path
     setAdminRoleCallable         superseded by `setStaffRole` above, which is the
                                  same operation with the bootstrap case solved
     platformLockdown             ../src/server/admin.ts (/platformConfig/abuse)
     enforceIpAllowlist           ../src/server/admin.ts (same document)
     resetLeaderboardsManual      the admin console calls the same settlement code
                                  the scheduled job above runs
     triggerLotteryDraw           ../src/server/earn/lottery.ts#drawLottery
     fulfilGdprRequest            ../src/server/admin.ts, plus `onUserDeleted`
                                  above for the Auth half

   Two of them had a real reason to be here and lost it:
     • `processWithdrawalBatch` kept its scheduled half — see #4 — but the
       broadcast half was removed with the signing key that would have made it
       work. A functions process must not hold one.
     • `scheduledBackup` was dropped entirely. `gcloud firestore export` on a
       Cloud Scheduler job with its own service account is strictly better than a
       function holding export permissions on the live database, and the retention
       policy belongs to a bucket lifecycle rule, not to code.

   ============================================================================
   BEFORE YOU DEPLOY — the operator checklist
   ----------------------------------------------------------------------------
   ENVIRONMENT
     BOOTSTRAP_ADMIN_EMAIL   the verified email allowed to mint the FIRST
                             super_admin through `setStaffRole`. Set it, sign in
                             as that account, grant yourself super_admin, then
                             UNSET it. The hatch also closes on its own once a
                             super_admin exists in `/staff`.
     COINGECKO_API_KEY       optional. Sent as `x-cg-demo-api-key`. Without it
                             `refreshRates` uses the free tier, which
                             rate-limits; a 30-minute schedule fits inside it,
                             but a shared egress IP may not.

   COMPOSITE INDEXES (in addition to what firestore.indexes.json already ships)
     users        suspended ASC, suspendedUntil ASC     → expireSuspensions
     chats        mode ASC, lastMessageAt ASC           → escalateStaleChats
     lotteryTickets round ASC, status ASC               → drawLottery. Two
                  equality filters are servable by index merging, so this one is
                  an optimisation rather than a requirement — add it before a
                  round gets large.
   Already present and relied on: `entries` board+value desc (#1), `entries`
   board+finalRank asc (#2), `withdrawals` status+rail+createdAt asc (#7).

   TTL POLICIES (Firestore → Time-to-live, one per collection group)
     captchaTokens   field `expiresAt`
     taskSessions    field `expiresAt`   (collection group, under /users/{uid})
   `cleanupEphemeral` exists because a TTL policy is not retroactive to documents
   written before it was enabled. With both policies on, the job costs one empty
   query an hour and is the backstop rather than the mechanism.

   SCHEDULES, ALL Etc/UTC
     resetLeaderboards            0 0 * * 0    Sunday 00:00
     drawLottery                  0 * * * *    hourly; draws on the configured slot
     processDirectWithdrawalBatch every 6 hours
     expireSuspensions            0 * * * *
     sweepStreaks                 10 0 * * *
     refreshRates                 every 30 minutes
     rollupDailyStats             5 0 * * *
     cleanupEphemeral             0 * * * *
     escalateStaleChats           every 30 minutes

   ONE MANUAL STEP AFTER THE FIRST DEPLOY
     `/leaderboard/current` must exist for the ledger's scoring write to have a
     parent, and `/lottery/current` for ticket sales. `drawLottery` seeds the
     lottery round on its first tick. The leaderboard document is created by
     `resetLeaderboards` at the end of its first run, so either wait for the first
     Sunday or write `{ period: <ISO week>, closed: false }` by hand.
   ========================================================================== */
