// Chog Daemons — tick scheduler (cron + lazy catch-up), seeding, guests (demo), orders.
import { client as dbc, q } from './db.js';
import { World, type Order } from './world.js';
import { DEMO, getMeta } from './engine.js';
import { TICK_MS, dayOf, type Card } from '../shared/daemons.js';
const MAX_CATCHUP = 96; // ≤ 2 days of ticks per request
const meta = async (k: string) => (await q.get(dbc, 'select v from meta where k=?', [k]))?.v as string | undefined;
const setMeta = (k: string, v: string) => q.run(dbc, 'insert or replace into meta(k,v) values(?,?)', [k, v]);
/** Cheap mutex in the DB so concurrent serverless instances don't double-tick. */
async function withLock<T>(fn: () => Promise<T>): Promise<T | null> {
  const now = Date.now();
  await q.run(dbc, "insert or ignore into meta(k,v) values('tick_lock','0')");
  const r = await dbc.execute({ sql: "update meta set v=? where k='tick_lock' and cast(v as integer) < ?", args: [String(now), now - 60_000] });
  if (!r.rowsAffected) return null;
  try { return await fn(); } finally { await q.run(dbc, "update meta set v='0' where k='tick_lock'"); }
}
export async function seedIfNeeded(force = false) {
  if (!force && (await meta('daemons_seeded'))) return;
  await withLock(async () => {
    if (!force && (await meta('daemons_seeded'))) return;
    await dbc.batch(['delete from daemons', 'delete from tiles', 'delete from orders', 'delete from events', 'delete from rels', 'delete from guests', 'delete from bounties', 'delete from balances', 'delete from nonces', 'delete from used_tx'], 'write');
    const w = new World(); const now = Date.now();
    const last = w.seed(7, now);
    await w.persist();
    await setMeta('last_tick', String(last)); await setMeta('season', '1'); await setMeta('daemons_seeded', String(now));
  });
}
/** Run all ticks that are due (lazy catch-up; also called by Vercel Cron). */
export async function catchUp(now = Date.now()) {
  const last = Number((await meta('last_tick')) ?? 0);
  if (now - last < TICK_MS) return { ran: 0, last };
  const r = await withLock(async () => {
    let lt = Number((await meta('last_tick')) ?? 0); if (now - lt < TICK_MS) return { ran: 0, last: lt };
    if ((now - lt) / TICK_MS > MAX_CATCHUP) lt = Math.floor(now / TICK_MS) * TICK_MS - MAX_CATCHUP * TICK_MS;
    const w = await World.load(dbc, now); let ran = 0;
    for (let T = lt + TICK_MS; T <= now; T += TICK_MS) { w.tick(T); lt = T; ran++; }
    await w.persist(); await setMeta('last_tick', String(lt));
    return { ran, last: lt, events: w.events.length };
  });
  return r ?? { ran: 0, last, busy: true };
}
export const nextTickAt = async () => Number((await meta('last_tick')) ?? Date.now()) + TICK_MS;
/** Seal an order for today (resolved at the next tick). One per daemon per day. */
export async function placeOrder(token: number, card: Card, target: number, source: string, issuer: string) {
  const day = dayOf(Date.now());
  const ex = await q.get(dbc, 'select * from orders where token_id=? and day=?', [token, day]);
  if (ex && ex.resolved_at != null && ex.source !== 'auto') return { error: 'You already gave today\'s order — it has resolved. New order card at 00:00 UTC.' } as const;
  if (ex && ex.source !== 'auto' && ex.issuer !== issuer) return { error: 'Another keeper already sealed an order for this daemon today.' } as const;
  await q.run(dbc, 'insert or replace into orders(token_id, day, card, target, source, issuer, created, resolved_at, event_id) values(?,?,?,?,?,?,?,null,null)', [token, day, card, target, source, issuer, Date.now()]);
  await q.run(dbc, 'insert or ignore into daemons(token_id) values(?)', [token]);
  return { ok: true, day } as const;
}
// ---------- guests (demo mode) ----------
export async function guestOf(session: string) { return q.get(dbc, 'select * from guests where session=?', [session]); }
export async function adopt(session: string, reroll = false) {
  const g = await guestOf(session); if (g && !reroll) return Number(g.token_id);
  const taken = new Set((await q.all(dbc, 'select token_id from guests where last_seen > ?', [Date.now() - 864e5])).map(r => Number(r.token_id)));
  const pool = DEMO.map(c => c.tokenId).filter(id => !taken.has(id) && id !== Number(g?.token_id));
  const id = (pool.length ? pool : DEMO.map(c => c.tokenId))[Math.floor(Math.random() * (pool.length || DEMO.length))];
  const w = await World.load(); const terr = w.territory();
  const rivals = [...w.rels.entries()].filter(([k, r]) => k.split('-').map(Number).includes(id) && r.bond <= -30).length;
  const d = w.touch(id); d.inherited = { from: 'a previous keeper', at: Date.now(), rivals, tiles: terr.get(id) ?? 0, curses: d.curses.filter(c => c.until > Date.now()).map(c => c.name), rep: d.rep };
  await w.persist();
  await q.run(dbc, 'insert or replace into guests(session, token_id, adopted_at, last_seen) values(?,?,?,?)', [session, id, Date.now(), Date.now()]);
  return id;
}
/** Demo fast-forward: resolve the guest's sealed order now, and let 2 daemons react to it ("overnight"). */
export async function fastForward(session: string) {
  const g = await guestOf(session); if (!g) return { error: 'adopt a daemon first' };
  const id = Number(g.token_id); const now = Date.now(); const day = dayOf(now);
  const r = await withLock(async () => {
    const w = await World.load(dbc, now);
    const o = w.orderOf(id, day);
    if (!o || o.resolvedAt != null) return { error: 'Seal an order card first (one per day).' };
    w.resolve(o, now);
    const others = w.awake().filter(x => x !== id && !w.orderOf(x, day)?.resolvedAt);
    for (let i = 0; i < 2 && others.length; i++) {
      const x = others.splice(Math.floor(Math.random() * others.length), 1)[0];
      const auto = w.autoOrder(x); const o2: Order = { token: x, day, card: auto.card === 'fortify' ? 'raid' : auto.card, target: id, source: 'auto', issuer: 'daemon', created: now, resolvedAt: null, eventId: null };
      w.orders.set(`${x}|${day}`, o2); w.resolve(o2, now + 1 + i);
    }
    await w.persist(); return { ok: true, events: w.events.length };
  });
  return r ?? { error: 'World is ticking, try again in a few seconds.' };
}
export const metaOk = (id: number) => !!getMeta(id);
