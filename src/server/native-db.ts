import 'server-only';

import pg from 'pg';

const { Pool } = pg;

type Row = Record<string, unknown>;
type Filter = { kind: 'eq' | 'neq' | 'gte' | 'lt' | 'in' | 'ilike'; column: string; value: unknown };
type FilterGroup = Filter[];
type ListResult = { data: Row[] | null; error: NativeDbError | null; count?: number };
type SingleResult = { data: Row | null; error: NativeDbError | null; count?: number };
type Order = { column: string; ascending: boolean };

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;
/* A projection is a comma-separated list of plain (optionally qualified)
   identifiers, each optionally carrying a parenthesised argument list such as
   count(*) — nothing else may reach the SQL string. The list must allow more
   than two columns: the ledger reads four at once. */
const COLUMN_ITEM = '[A-Za-z_][A-Za-z0-9_]*(?:\\s*\\.\\s*[A-Za-z_][A-Za-z0-9_]*)?(?:\\s*\\([^)]*\\))?';
const SAFE_COLUMNS = new RegExp(`^${COLUMN_ITEM}(?:\\s*,\\s*${COLUMN_ITEM})*$`);

function identifier(value: string): string {
  if (!IDENTIFIER.test(value)) throw new Error(`Unsafe database identifier: ${value}`);
  return value;
}

function columns(value: string): string {
  if (value === '*' || SAFE_COLUMNS.test(value)) return value;
  throw new Error(`Unsafe database projection: ${value}`);
}

export class NativeDbError extends Error {
  code?: string;
  details?: string;
  hint?: string;
  constructor(message: string, source?: { code?: string; detail?: string; hint?: string }) {
    super(message);
    this.name = 'NativeDbError';
    this.code = source?.code;
    this.details = source?.detail;
    this.hint = source?.hint;
  }
}

type PoolClientLike = { query<T extends Row = Row>(text: string, values?: unknown[]): Promise<{ rows: T[]; rowCount: number | null }>; release(): void };
type PoolLike = { query<T extends Row = Row>(text: string, values?: unknown[]): Promise<{ rows: T[]; rowCount: number | null }>; connect(): Promise<PoolClientLike>; end(): Promise<void> };
type PoolConfigLike = { connectionString?: string; host?: string; port?: number; database?: string; user?: string; password?: string; ssl?: boolean | { rejectUnauthorized?: boolean }; max?: number };

let pool: PoolLike | null = null;

function connectionConfig(): PoolConfigLike {
  const url = process.env.DATABASE_URL;
  if (url) return { connectionString: url, ssl: process.env.DATABASE_SSL === 'disable' ? false : { rejectUnauthorized: false }, max: 8 };
  const host = process.env.BOOTKEEP_DB_HOST ?? process.env.SUPABASE_DB_HOST;
  const password = process.env.BOOTKEEP_DB_PASSWORD ?? process.env.SUPABASE_DB_PASSWORD;
  if (!host || !password) throw new Error('DATABASE_URL or BOOTKEEP_DB_HOST/BOOTKEEP_DB_PASSWORD must be configured.');
  return {
    host,
    port: Number(process.env.BOOTKEEP_DB_PORT ?? process.env.SUPABASE_DB_PORT ?? 5432),
    database: process.env.BOOTKEEP_DB_NAME ?? process.env.SUPABASE_DB_NAME ?? 'postgres',
    user: process.env.BOOTKEEP_DB_USER ?? process.env.SUPABASE_DB_USER ?? 'postgres',
    password,
    ssl: process.env.DATABASE_SSL === 'disable' ? false : { rejectUnauthorized: false },
    max: 8,
  };
}

export function isNativeDbReady(): boolean {
  return Boolean(process.env.DATABASE_URL || ((process.env.BOOTKEEP_DB_HOST ?? process.env.SUPABASE_DB_HOST) && (process.env.BOOTKEEP_DB_PASSWORD ?? process.env.SUPABASE_DB_PASSWORD)));
}

export function getPool(): PoolLike {
  if (!pool) pool = new Pool(connectionConfig()) as unknown as PoolLike;
  return pool;
}

export async function query<T extends Row = Row>(text: string, values: unknown[] = []): Promise<{ rows: T[]; rowCount: number | null }> {
  try {
    return await getPool().query<T>(text, values);
  } catch (error) {
    throw new NativeDbError(error instanceof Error ? error.message : 'Database query failed.', error as { code?: string; detail?: string; hint?: string });
  }
}

export async function closePool(): Promise<void> {
  if (pool) await pool.end();
  pool = null;
}

class QueryBuilder {
  private filters: Filter[] = [];
  private anyFilterGroups: FilterGroup[] = [];
  private ordering: Order[] = [];
  private maxRows: number | null = null;
  private maybe = false;
  private projection = '*';
  private countMode = false;
  private head = false;
  private writeSelect: string | null = null;
  private operation: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
  private payload: Row | Row[] | null = null;
  private upsertConflict: string[] = [];
  private ignoreDuplicates = false;

  constructor(private readonly table: string) {
    identifier(table);
  }

  select(fields = '*', options?: { count?: 'exact'; head?: boolean }): this {
    this.projection = columns(fields);
    this.countMode = options?.count === 'exact';
    this.head = options?.head === true;
    if (this.operation !== 'select') this.writeSelect = this.projection;
    return this;
  }

  insert(value: Row | Row[]): this { this.operation = 'insert'; this.payload = value; return this; }
  update(value: Row): this { this.operation = 'update'; this.payload = value; return this; }
  upsert(value: Row | Row[], options?: { onConflict?: string; ignoreDuplicates?: boolean }): this {
    this.operation = 'upsert'; this.payload = value;
    this.upsertConflict = (options?.onConflict ?? '').split(',').map((v) => v.trim()).filter(Boolean);
    this.ignoreDuplicates = options?.ignoreDuplicates === true;
    return this;
  }
  delete(): this { this.operation = 'delete'; return this; }
  eq(column: string, value: unknown): this { this.filters.push({ kind: 'eq', column: identifier(column), value }); return this; }
  neq(column: string, value: unknown): this { this.filters.push({ kind: 'neq', column: identifier(column), value }); return this; }
  gte(column: string, value: unknown): this { this.filters.push({ kind: 'gte', column: identifier(column), value }); return this; }
  lt(column: string, value: unknown): this { this.filters.push({ kind: 'lt', column: identifier(column), value }); return this; }
  in(column: string, value: unknown[]): this { this.filters.push({ kind: 'in', column: identifier(column), value }); return this; }
  ilike(column: string, value: string): this { this.filters.push({ kind: 'ilike', column: identifier(column), value }); return this; }
  or(expression: string): this {
    const group: FilterGroup = [];
    const clauses = expression.split(',').map((part) => part.trim()).filter(Boolean);
    for (const clause of clauses) {
      const match = clause.match(/^([A-Za-z_][A-Za-z0-9_]*)\.(eq|neq|ilike)\.(.*)$/);
      if (!match) throw new Error(`Unsupported filter expression: ${clause}`);
      group.push({ kind: match[2] as Filter['kind'], column: identifier(match[1]!), value: match[3] });
    }
    if (group.length) this.anyFilterGroups.push(group);
    return this;
  }
  order(column: string, options?: { ascending?: boolean }): this { this.ordering.push({ column: identifier(column), ascending: options?.ascending !== false }); return this; }
  limit(value: number): this { this.maxRows = Math.max(0, Math.trunc(value)); return this; }
  single(): Promise<SingleResult> { this.maxRows = 1; return this.executeSingle(); }
  /* Supabase semantics: maybeSingle() resolves { data: null, error: null } when no
     row matches, and only single() reports a missing row as an error. Code in this
     app is written against those semantics — e.g. an account with no cooldown row
     yet — so the distinction has to survive the shim. */
  maybeSingle(): Promise<SingleResult> { this.maxRows = 1; this.maybe = true; return this.executeSingle(); }

  then<TResult1 = ListResult, TResult2 = never>(
    onfulfilled?: ((value: ListResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<ListResult> {
    try {
      const result = await this.run();
      return { data: Array.isArray(result.data) ? result.data : result.data ? [result.data] : null, error: result.error, count: result.count };
    } catch (error) {
      const dbError = error instanceof NativeDbError ? error : new NativeDbError(error instanceof Error ? error.message : 'Database operation failed.');
      return { data: null, error: dbError };
    }
  }

  private async executeSingle(): Promise<SingleResult> {
    try {
      const result = await this.run();
      return { data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data, error: result.error, count: result.count };
    } catch (error) {
      const dbError = error instanceof NativeDbError ? error : new NativeDbError(error instanceof Error ? error.message : 'Database operation failed.');
      return { data: null, error: dbError };
    }
  }

  private where(values: unknown[]): string {
    if (!this.filters.length) return '';
    const parts: string[] = [];
    for (const filter of this.filters) {
      if (filter.kind === 'in') {
        const list = filter.value as unknown[];
        if (!list.length) { parts.push('FALSE'); continue; }
        const placeholders = list.map((value) => { values.push(value); return `$${values.length}`; });
        parts.push(`${filter.column} IN (${placeholders.join(',')})`);
      } else {
        values.push(filter.value);
        const op = filter.kind === 'eq' ? '=' : filter.kind === 'neq' ? '<>' : filter.kind === 'gte' ? '>=' : filter.kind === 'lt' ? '<' : 'ILIKE';
        parts.push(`${filter.column} ${op} $${values.length}`);
      }
    }
    for (const group of this.anyFilterGroups) {
      const anyParts = group.map((filter) => {
        values.push(filter.value);
        const op = filter.kind === 'eq' ? '=' : filter.kind === 'neq' ? '<>' : 'ILIKE';
        return `${filter.column} ${op} $${values.length}`;
      });
      parts.push(`(${anyParts.join(' OR ')})`);
    }
    return ` WHERE ${parts.join(' AND ')}`;
  }

  private async run(): Promise<{ data: Row[] | Row | null; error: NativeDbError | null; count?: number }> {
    if (this.operation === 'select') {
      const values: unknown[] = [];
      const where = this.where(values);
      const order = this.ordering.length ? ` ORDER BY ${this.ordering.map((o) => `${o.column} ${o.ascending ? 'ASC' : 'DESC'}`).join(', ')}` : '';
      const limit = this.maxRows === null ? '' : ` LIMIT ${this.maxRows}`;
      const select = this.countMode ? 'COUNT(*)::int AS count' : this.head ? '1' : this.projection;
      const result = await query(`SELECT ${select} FROM ${this.table}${where}${order}${limit}`, values);
      if (this.countMode) return { data: this.head ? null : result.rows, error: null, count: Number(result.rows[0]?.count ?? 0) };
      if (this.maxRows === 1 && result.rows.length === 0) {
        if (this.maybe) return { data: null, error: null };
        return { data: null, error: new NativeDbError('No rows found.', { code: 'PGRST116' }) };
      }
      const rows = result.rows as Row[];
      return { data: this.maxRows === 1 ? (rows[0] ?? null) : rows, error: null };
    }

    const values: unknown[] = [];
    const writeProjection = this.writeSelect ? ` RETURNING ${this.writeSelect}` : '';
    if (this.operation === 'insert' || this.operation === 'upsert') {
      const rows: Row[] = Array.isArray(this.payload) ? this.payload : [this.payload ?? {}];
      if (!rows.length) return { data: [], error: null };
      const keys = Object.keys(rows[0] ?? {});
      keys.forEach(identifier);
      const tuples = rows.map((row) => `(${keys.map((key) => { values.push(row[key]); return `$${values.length}`; }).join(', ')})`);
      const conflict = this.operation === 'upsert' && this.upsertConflict.length
        ? this.ignoreDuplicates ? ` ON CONFLICT (${this.upsertConflict.map(identifier).join(', ')}) DO NOTHING` : ` ON CONFLICT (${this.upsertConflict.map(identifier).join(', ')}) DO UPDATE SET ${keys.filter((key) => !this.upsertConflict.includes(key)).map((key) => `${identifier(key)} = EXCLUDED.${identifier(key)}`).join(', ')}`
        : '';
      const result = await query(`INSERT INTO ${this.table} (${keys.map(identifier).join(', ')}) VALUES ${tuples.join(', ')}${conflict}${writeProjection}`, values);
      return { data: this.maxRows === 1 ? (result.rows[0] ?? null) : result.rows, error: null };
    }
    if (this.operation === 'update') {
      const payload = this.payload as Row;
      const keys = Object.keys(payload);
      keys.forEach(identifier);
      const set = keys.map((key) => { values.push(payload[key]); return `${identifier(key)} = $${values.length}`; }).join(', ');
      const where = this.where(values);
      const result = await query(`UPDATE ${this.table} SET ${set}${where}${writeProjection}`, values);
      return { data: this.maxRows === 1 ? (result.rows[0] ?? null) : result.rows, error: null };
    }
    const where = this.where(values);
    const result = await query(`DELETE FROM ${this.table}${where}${writeProjection}`, values);
    return { data: this.maxRows === 1 ? (result.rows[0] ?? null) : result.rows, error: null };
  }
}

export class NativeDbClient {
  from(table: string): QueryBuilder { return new QueryBuilder(table); }
  async rpc(name: string, args: Row): Promise<{ data: unknown; error: NativeDbError | null }> {
    try {
      identifier(name);
      const keys = Object.keys(args);
      const result = await query<{ result: unknown }>(`SELECT public.${identifier(name)}(${keys.map((key) => `$${keys.indexOf(key) + 1}`).join(', ')}) AS result`, keys.map((key) => args[key]));
      return { data: result.rows[0]?.result ?? null, error: null };
    } catch (error) {
      const dbError = error instanceof NativeDbError ? error : new NativeDbError(error instanceof Error ? error.message : 'RPC failed.');
      return { data: null, error: dbError };
    }
  }
}

export function getNativeDb(): NativeDbClient {
  if (!isNativeDbReady()) throw new Error('Native PostgreSQL is not configured.');
  return new NativeDbClient();
}
