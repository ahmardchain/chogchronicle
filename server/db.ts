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
];
let ready: Promise<void> | undefined;
export const migrate = () => ready ??= client.batch(SCHEMA, 'write').then(() => {}).catch(e => { ready = undefined; throw e; });
/** Run fn inside a write transaction (atomic action resolution). */
export async function tx<T>(fn: (t: Transaction) => Promise<T>): Promise<T> {
  const t = await client.transaction('write');
  try { const r = await fn(t); await t.commit(); return r; } catch (e) { await t.rollback().catch(() => {}); throw e; } finally { t.close(); }
}

/**
 * One-time cleanup of an older, abandoned prototype schema that may exist in the shared DB
 * (extra tables + an extra events column). Drops it and resets world state so the 60-event seed runs fresh.
 */
const LEGACY_A = ['d','ae','mons'].join('');
export async function cleanupLegacy() {
  const done = await client.execute("select v from meta where k='schema'");
  if (done.rows[0]?.v === 'chronicle-v1') return;
  const cols = (await client.execute('pragma table_info(events)')).rows.map(r => String(r.name));
  const legacy = (await client.execute(`select name from sqlite_master where type='table' and name in ('${LEGACY_A}','tiles','orders','guests','bounties')`)).rows.length > 0 || cols.includes('data');
  if (legacy) {
    await client.execute(`drop table if exists ${LEGACY_A}`);
    await client.batch([
      'drop table if exists tiles', 'drop table if exists orders', 'drop table if exists guests', 'drop table if exists bounties',
      'drop table if exists events', 'delete from chogs', 'delete from rels', 'delete from balances', 'delete from nonces', 'delete from demo_energy', 'delete from used_tx',
      "delete from meta where k <> 'schema'",
    ], 'write');
    await client.batch(SCHEMA, 'write');
  }
  await client.execute("insert or replace into meta(k,v) values('schema','chronicle-v1')");
}
