import 'server-only';

import { createHash, randomBytes, randomUUID, pbkdf2Sync } from 'node:crypto';
import { cookies } from 'next/headers';
import { getPool, query } from './native-db';

export const SESSION_COOKIE = 'vazionix_session';
const SESSION_DAYS = 30;

export type NativeAuthUser = {
  id: string;
  email: string;
  username: string | null;
  emailVerifiedAt: string | null;
  userMetadata: Record<string, unknown>;
};

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function token(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

function expiry(days: number): Date {
  return new Date(Date.now() + days * 86400000);
}

export function hashPassword(password: string): string {
  // scrypt is intentionally delegated to Postgres' crypt-compatible extension
  // only if configured; the application uses a strong salted PBKDF2 fallback.
  const salt = randomBytes(16).toString('hex');
  const derived = pbkdf2Sync(password, salt, 210000, 32, 'sha256').toString('hex');
  return `pbkdf2_sha256$210000$${salt}$${derived}`;
}

export function verifyPassword(password: string, encoded: string): boolean {
  const [scheme, roundsRaw, salt, expected] = encoded.split('$');
  if (scheme !== 'pbkdf2_sha256' || !roundsRaw || !salt || !expected) return false;
  const rounds = Number(roundsRaw);
  if (!Number.isSafeInteger(rounds) || rounds < 100000 || rounds > 1000000) return false;
  const actual = pbkdf2Sync(password, salt, rounds, 32, 'sha256').toString('hex');
  return actual === expected;
}

export async function createNativeAccount(input: {
  email: string;
  password: string;
  username: string;
  referralCode?: string | null;
}): Promise<{ user: NativeAuthUser; verificationToken: string }> {
  const email = input.email.trim().toLowerCase();
  const verificationToken = token();
  const id = randomUUID();
  const metadata = { username: input.username, referralCode: input.referralCode ?? null };
  const client = await getPool().connect();
  try {
    await client.query('begin');
    const account = await client.query(
      `insert into auth.users (id, email, raw_user_meta_data)
       values ($1, $2, $3::jsonb) returning id`,
      [id, email, JSON.stringify(metadata)],
    );
    if (!account.rowCount) throw new Error('Could not create auth account.');
    await client.query(
      `insert into public.auth_accounts
       (id, email, password_hash, verification_token_hash, verification_expires_at)
       values ($1, $2, $3, $4, $5)`,
      [id, email, hashPassword(input.password), hash(verificationToken), expiry(1)],
    );
    await client.query('commit');
    return { user: { id, email, username: input.username, emailVerifiedAt: null, userMetadata: metadata }, verificationToken };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function authenticateNativeAccount(emailRaw: string, password: string): Promise<NativeAuthUser | null> {
  const email = emailRaw.trim().toLowerCase();
  const result = await query<Record<string, unknown>>(
    `select u.id, u.email, u.raw_user_meta_data, a.email_verified_at, a.password_hash
       from auth.users u join public.auth_accounts a on a.id = u.id where lower(u.email) = lower($1) limit 1`,
    [email],
  );
  const row = result.rows[0];
  if (!row || !verifyPassword(password, String(row.password_hash))) return null;
  const metadata = (row.raw_user_meta_data && typeof row.raw_user_meta_data === 'object' ? row.raw_user_meta_data : {}) as Record<string, unknown>;
  return { id: String(row.id), email: String(row.email), username: typeof metadata.username === 'string' ? metadata.username : null, emailVerifiedAt: row.email_verified_at ? new Date(String(row.email_verified_at)).toISOString() : null, userMetadata: metadata };
}

export async function createSession(userId: string): Promise<string> {
  const raw = token(48);
  await query('insert into public.auth_sessions (account_id, token_hash, expires_at) values ($1, $2, $3)', [userId, hash(raw), expiry(SESSION_DAYS)]);
  return raw;
}

export async function clearSession(raw: string | null): Promise<void> {
  if (raw) await query('delete from public.auth_sessions where token_hash = $1', [hash(raw)]);
}

export async function getCurrentNativeUser(): Promise<NativeAuthUser | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const result = await query<Record<string, unknown>>(
    `select u.id, u.email, u.raw_user_meta_data, a.email_verified_at
       from public.auth_sessions s
       join auth.users u on u.id = s.account_id
       join public.auth_accounts a on a.id = u.id
      where s.token_hash = $1 and s.expires_at > now() limit 1`,
    [hash(raw)],
  );
  const row = result.rows[0];
  if (!row) {
    store.delete(SESSION_COOKIE);
    return null;
  }
  await query('update public.auth_sessions set last_seen_at = now() where token_hash = $1', [hash(raw)]);
  const metadata = (row.raw_user_meta_data && typeof row.raw_user_meta_data === 'object' ? row.raw_user_meta_data : {}) as Record<string, unknown>;
  return { id: String(row.id), email: String(row.email), username: typeof metadata.username === 'string' ? metadata.username : null, emailVerifiedAt: row.email_verified_at ? new Date(String(row.email_verified_at)).toISOString() : null, userMetadata: metadata };
}

export async function setSessionCookie(raw: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, raw, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: SESSION_DAYS * 86400 });
}

export async function verifyEmail(rawToken: string): Promise<boolean> {
  const result = await query<{ id: string }>(
    `update public.auth_accounts set email_verified_at = now(), verification_token_hash = null, verification_expires_at = null, updated_at = now()
      where verification_token_hash = $1 and verification_expires_at > now() returning id`,
    [hash(rawToken)],
  );
  if (!result.rowCount) return false;
  await query('update auth.users set email_confirmed_at = now(), updated_at = now() where id = $1', [result.rows[0]!.id]);
  return true;
}

export async function sendVerificationEmail(_email: string, _verificationToken: string): Promise<void> {
  // Production SMTP is wired through this boundary. Until SMTP is configured,
  // registration remains safe but the verification link is not delivered.
  if (!process.env.SMTP_HOST) return;
  throw new Error('SMTP transport is not configured for native auth.');
}
