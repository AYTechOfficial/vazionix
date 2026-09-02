import 'server-only';

import { FieldValue, Timestamp, type DocumentSnapshot, type Query } from 'firebase-admin/firestore';

import { getAdminDb } from '@/lib/firebase/admin';

/* ============================================================================
   SERVER DATA ACCESS — primitives
   ----------------------------------------------------------------------------
   Everything under `src/server/**` reads and writes through here, so there is
   exactly one place that knows how a Firestore document becomes JSON safe to
   hand a Client Component.

   THE TIMESTAMP RULE
   A Firestore Timestamp is a class instance. Passing one from a Server
   Component to a Client Component throws at serialisation time, and passing one
   through `JSON.stringify` silently produces `{_seconds, _nanoseconds}` that no
   date formatter understands. Every read model therefore carries ISO strings,
   converted here and nowhere else.
   ========================================================================== */

export { FieldValue, Timestamp };

export const db = () => getAdminDb();

export const now = () => FieldValue.serverTimestamp();

/** Timestamp | Date | null → ISO string | null. */
export function iso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return new Date(value).toISOString();
  if (typeof value === 'object' && value && '_seconds' in value) {
    const seconds = Number((value as { _seconds: number })._seconds);
    return Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : null;
  }
  return null;
}

/** Same as `iso` but never null — falls back to the epoch-safe current time. */
export const isoOr = (value: unknown, fallback = new Date().toISOString()): string =>
  iso(value) ?? fallback;

export const toMillis = (value: unknown): number => {
  const s = iso(value);
  return s ? Date.parse(s) : 0;
};

/** Coerce anything Firestore hands back into a finite integer. */
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

/** `{ id, ...data }` with no Timestamp instances left inside. */
export function withId<T extends Record<string, unknown>>(snap: DocumentSnapshot): T & { id: string } {
  return { id: snap.id, ...(snap.data() ?? {}) } as T & { id: string };
}

/** Run a query and map each doc, tolerating a missing collection. */
export async function mapQuery<T>(
  query: Query,
  map: (snap: DocumentSnapshot) => T,
): Promise<T[]> {
  const snap = await query.get();
  return snap.docs.map(map);
}

/* ---- UTC DAY KEYS ----------------------------------------------------------
   Daily caps, streaks and "today" counters all key off the same UTC day
   string. Local time would give a user in UTC+13 a different day boundary from
   the counter that limits them, which is exploitable.                      */

export const dayKey = (d: Date = new Date()): string => d.toISOString().slice(0, 10);

export const monthKey = (d: Date = new Date()): string => d.toISOString().slice(0, 7);

/** ISO week id, `2026-W07`. Used as the leaderboard period id. */
export function weekKey(d: Date = new Date()): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Next occurrence of a weekday + hour in UTC, as a Date. */
export function nextUtcWeekday(dayOfWeek: number, hourUtc: number, from: Date = new Date()): Date {
  const target = new Date(from);
  target.setUTCHours(hourUtc, 0, 0, 0);
  const delta = (dayOfWeek - target.getUTCDay() + 7) % 7;
  target.setUTCDate(target.getUTCDate() + delta);
  if (target <= from) target.setUTCDate(target.getUTCDate() + 7);
  return target;
}

/* ---- ERRORS ----------------------------------------------------------------
   One error type for everything a route handler should turn into a 4xx with a
   message a user can act on. Anything else is a 500 and gets logged, not
   shown.                                                                    */

export class AppError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code = 'bad_request',
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, code = 'bad_request') => new AppError(message, 400, code);
export const unauthorized = (message = 'Sign in to continue.') => new AppError(message, 401, 'unauthenticated');
export const forbidden = (message = 'You do not have access to that.') => new AppError(message, 403, 'forbidden');
export const notFound = (message = 'Not found.') => new AppError(message, 404, 'not_found');
export const conflict = (message: string, code = 'conflict') => new AppError(message, 409, code);
export const tooMany = (message: string, code = 'rate_limited') => new AppError(message, 429, code);

/** True when the Admin SDK has enough credentials to reach Firestore. */
export function isServerFirebaseReady(): boolean {
  return Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.FIRESTORE_EMULATOR_HOST ||
      process.env.GCLOUD_PROJECT ||
      process.env.K_SERVICE,
  );
}
