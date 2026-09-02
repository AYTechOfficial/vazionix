/* ============================================================================
   CORE — the Admin SDK handles and the primitives every job shares
   ----------------------------------------------------------------------------
   One module owns `initializeApp()` so the rest of the bundle can import a
   ready `db()` without worrying about load order, and one module owns the
   coercions so a Firestore field that came back as a string, a number or
   nothing at all becomes the same integer everywhere.

   The time keys are the important part. Daily caps, streaks, stats rows and
   leaderboard periods all key off UTC, computed here and nowhere else: a user
   in UTC+13 whose day rolls over before the counter that limits them is a
   free extra day of claims, and that is exploitable rather than cosmetic.

   These mirror `../src/server/db.ts` deliberately — `functions/` is a separate
   TypeScript project with its own tsconfig and cannot import from the web app,
   so the two copies must stay in step. If you change `weekKey` or `dayKey`
   here, change it there in the same commit or the leaderboard period the
   ledger writes stops matching the period this job settles.
   ========================================================================== */

import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import {
  FieldPath,
  FieldValue,
  Timestamp,
  getFirestore,
  type Firestore,
} from 'firebase-admin/firestore';

if (!getApps().length) initializeApp();

export { FieldPath, FieldValue, Timestamp };

export const db = (): Firestore => getFirestore();
export const auth = (): Auth => getAuth();

/** Server timestamp sentinel. Never `new Date()` — the client clock is not ours
    and a function instance's clock can drift from Firestore's. */
export const now = () => FieldValue.serverTimestamp();

/* ---- COERCIONS ------------------------------------------------------------ */

export const int = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};

export const num = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export const str = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

export const bool = (value: unknown, fallback = false): boolean =>
  typeof value === 'boolean' ? value : fallback;

/** Timestamp | Date | ISO string | epoch millis → millis, or 0 when absent.
    Returning 0 rather than throwing is deliberate: a missing timestamp reads as
    "infinitely long ago", which is the safe answer for every staleness check in
    this file. */
export function millis(value: unknown): number {
  if (!value) return 0;
  if (value instanceof Timestamp) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value === 'object' && value && '_seconds' in value) {
    const seconds = Number((value as { _seconds: unknown })._seconds);
    return Number.isFinite(seconds) ? seconds * 1000 : 0;
  }
  return 0;
}

/* ---- UTC KEYS ------------------------------------------------------------- */

export const dayKey = (d: Date = new Date()): string => d.toISOString().slice(0, 10);

/** ISO week id, `2026-W07`. The leaderboard period id. */
export function weekKey(d: Date = new Date()): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Next occurrence of a weekday + hour in UTC. Used for the lottery's `drawsAt`,
    which is what the countdown on the lottery page renders. */
export function nextUtcWeekday(dayOfWeek: number, hourUtc: number, from: Date = new Date()): Date {
  const target = new Date(from);
  target.setUTCHours(hourUtc, 0, 0, 0);
  const delta = (dayOfWeek - target.getUTCDay() + 7) % 7;
  target.setUTCDate(target.getUTCDate() + delta);
  if (target <= from) target.setUTCDate(target.getUTCDate() + 7);
  return target;
}

/* ---- BOUNDS ---------------------------------------------------------------
   Every sweep in this bundle is capped twice: by a document budget, and by a
   wall clock. A scheduled function that runs until the platform kills it loses
   the cursor it was about to persist, so it restarts from the top on the next
   tick and never finishes. Stopping early on purpose is how a sweep converges.
   ------------------------------------------------------------------------- */

export class Budget {
  private readonly until: number;
  private spent = 0;

  constructor(
    seconds: number,
    private readonly writes: number,
  ) {
    this.until = Date.now() + seconds * 1000;
  }

  /** False once either the clock or the write budget is gone. */
  ok(): boolean {
    return Date.now() < this.until && this.spent < this.writes;
  }

  spend(n: number): void {
    this.spent += n;
  }

  get used(): number {
    return this.spent;
  }
}

/** Split a list into fixed-size chunks. Firestore commits at most 500 writes
    per batch; every caller here uses 400 to leave room for the counters that
    ride along with the batch. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/* ---- DETERMINISTIC RANDOMNESS --------------------------------------------
   The lottery draw must be reproducible by someone who does not trust us. The
   published seed plus these two functions is the whole verification procedure:
   hash the seed, seed the generator, shuffle the tickets in the stored order.
   `Math.random()` cannot be audited after the fact, so it is not used for
   anything that pays out.
   ------------------------------------------------------------------------- */

/** FNV-1a, 32-bit. Turns the published seed string into the generator's state. */
export function fnv1a(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32. Small, fast, and — the only property that matters here —
    identical on every machine that runs it with the same seed. */
export function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates, driven by a seeded generator. Mutates a copy, returns it. */
export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = out[i] as T;
    const b = out[j] as T;
    out[i] = b;
    out[j] = a;
  }
  return out;
}
