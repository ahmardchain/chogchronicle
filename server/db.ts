import type { Client, InArgs, Transaction } from '@libsql/client';
import fs from 'fs'; import path from 'path';
/** Readable config error (reported as JSON by the API instead of crashing the function). */
export class ConfigError extends Error {}
/**
 * Turso/libSQL in production (TURSO_DATABASE_URL + TURSO_AUTH_TOKEN) via the pure-JS web client (no native deps);
 * local SQLite file fallback for dev via the Node client (loaded lazily so serverless never touches the native binary).
 */
let real: Promise<Client> | undefined;
async function makeClient(): Promise<Client> {
  const url = process.env.TURSO_DATABASE_URL?.trim();
  if (url && !url.startsWith('file:')) {
    const { createClient } = await import('@libsql/client/web');
    return createClient({ url: url.replace(/^libsql:\/\//, 'https://'), authToken: process.env.TURSO_AUTH_TOKEN?.trim() });
  }
  if (process.env.VERCEL && !url) throw new ConfigError('TURSO_DATABASE_URL is not set. Add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Vercel → Settings → Environment Variables, then redeploy.');
  const { createClient } = await import('@libsql/client');
  const file = url || 'file:' + path.resolve(process.env.DB_PATH || 'data/chronicle.db');
  fs.mkdirSync(path.dirname(file.replace(/^file:/, '')), { recursive: true });
  return createClient({ url: file });
}
export const getClient = () => (real ??= makeClient().catch(e => { real = undefined; throw e; }));
/** Lazy facade so importing this module never throws or opens connections. */
export const client = {
  execute: async (stmt: any) => (await getClient()).execute(stmt),
  batch: async (stmts: any, mode?: any) => (await getClient()).batch(stmts, mode),
  transaction: async (mode?: any) => (await getClient()).transaction(mode),
} as unknown as Client;
export type Exec = Client | Transaction;
export const q = {
  get: async <T = any>(x: Exec, sql: string, args: InArgs = []) => (await x.execute({ sql, args })).rows[0] as T | undefined,
  all: async <T = any>(x: Exec, sql: string, args: InArgs = []) => (await x.execute({ sql, args })).rows as unknown as T[],
  run: async (x: Exec, sql: string, args: InArgs = []) => { await x.execute({ sql, args }); },
};
const SCHEMA = [
  `create table if not exists chogs(token_id integer primary key, rep integer not null default 100, energy_day text, energy_used integer default 0, streak_last text, streak_n integer default 0, achievements text default '[]')`,
  `create table if not exists rels(a integer, b integer, bond integer default 0, duels integer default 0, wins_a integer default 0, primary key(a,b))`,
  `create table if not exists events(id text primary key, t integer, actor integer, target integer, action text, success integer, text text, rep_a integer, rep_b integer, signer text)`,
  `create index if not exists ev_actor on events(actor)`, `create index if not exists ev_target on events(target)`, `create index if not exists ev_t on events(t desc)`,
  `create table if not exists balances(owner text primary key, bal integer not null)`,
  `create table if not exists nonces(nonce text primary key, address text, created integer, used integer default 0)`,
  `create table if not exists meta(k text primary key, v text)`,
  `create table if not exists used_tx(hash text primary key, event_id text, created integer)`,
  `create table if not exists demo_energy(session text, token_id integer, day text, used integer, primary key(session, token_id))`,
  `create table if not exists metadata(token_id integer primary key, json text)`,
  `create table if not exists daemons(token_id integer primary key, rep integer default 100, fort integer default 0, curses text default '[]', intel text default '[]', last_owner text, inherited text, awake integer default 1)`,
  `create table if not exists tiles(tile_id integer primary key, owner integer not null)`,
  `create table if not exists orders(token_id integer, day text, card text, target integer, source text, issuer text, created integer, resolved_at integer, event_id text, primary key(token_id, day))`,
  `create index if not exists orders_pending on orders(resolved_at)`,
  `create table if not exists guests(session text primary key, token_id integer, adopted_at integer, last_seen integer)`,
  `create table if not exists bounties(id text primary key, target integer, amount integer, poster text, created integer, claimed_by integer, claimed_at integer, tx text)`,
];
let ready: Promise<void> | undefined;
export const migrate = () => ready ??= client.batch(SCHEMA, 'write')
  .then(() => client.execute('alter table events add column data text').catch(() => {})) // idempotent column add
  .then(() => {}).catch(e => { ready = undefined; throw e; });
/** Run fn inside a write transaction (atomic action resolution). */
export async function tx<T>(fn: (t: Transaction) => Promise<T>): Promise<T> {
  const t = await client.transaction('write');
  try { const r = await fn(t); await t.commit(); return r; } catch (e) { await t.rollback().catch(() => {}); throw e; } finally { t.close(); }
}
