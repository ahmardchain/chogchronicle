import Database from 'better-sqlite3';
import fs from 'fs'; import path from 'path';
const file = process.env.DB_PATH || path.resolve('data/chronicle.db');
fs.mkdirSync(path.dirname(file), { recursive: true });
export const db = new Database(file);
db.pragma('journal_mode = WAL');
db.exec(`
create table if not exists chogs(token_id integer primary key, rep integer not null default 100, energy_day text, energy_used integer default 0, streak_last text, streak_n integer default 0, achievements text default '[]');
create table if not exists rels(a integer, b integer, bond integer default 0, duels integer default 0, wins_a integer default 0, primary key(a,b));
create table if not exists events(id text primary key, t integer, actor integer, target integer, action text, success integer, text text, rep_a integer, rep_b integer, signer text);
create index if not exists ev_actor on events(actor); create index if not exists ev_target on events(target); create index if not exists ev_t on events(t desc);
create table if not exists balances(owner text primary key, bal integer not null);
create table if not exists nonces(nonce text primary key, address text, created integer, used integer default 0);
create table if not exists meta(k text primary key, v text);
create table if not exists metadata(token_id integer primary key, json text);
`);
