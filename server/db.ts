import { createClient, type Client, type InArgs, type Transaction } from '@libsql/client';
import fs from 'fs'; import path from 'path';
/** Turso/libSQL in production (TURSO_DATABASE_URL + TURSO_AUTH_TOKEN); local SQLite file fallback for dev. */
function makeClient(): Client {
  const url = process.env.TURSO_DATABASE_URL;
  if (url) return createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  if (process.env.VERCEL) throw new Error('TURSO_DATABASE_URL is required on Vercel (no persistent filesystem).');
  const file = path.resolve(process.env.DB_PATH || 'data/chronicle.db');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return createClient({ url: 'file:' + file });
}
export const client = makeClient();
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
export const migrate = () => ready ??= client.batch(SCHEMA, 'write').then(() => {});
/** Run fn inside a write transaction (atomic action resolution). */
export async function tx<T>(fn: (t: Transaction) => Promise<T>): Promise<T> {
  const t = await client.transaction('write');
  try { const r = await fn(t); await t.commit(); return r; } catch (e) { await t.rollback().catch(() => {}); throw e; } finally { t.close(); }
}
