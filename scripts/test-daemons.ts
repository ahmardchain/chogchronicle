// Daemons engine checks against a running API (default dev :8787 with local file DB data/chronicle.db).
import { createClient } from '@libsql/client';
import path from 'path';
const B = process.env.API || 'http://localhost:8787/api';
const db = createClient({ url: 'file:' + path.resolve(process.env.DB_PATH || 'data/chronicle.db') });
const j = async (p: string, b?: unknown, h: Record<string, string> = {}) => { const r = await fetch(B + p, b ? { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(b) } : { headers: h }); return [r.status, await r.json()] as [number, any]; };
const out: Record<string, unknown> = {};
const [, w0] = await j('/world');
// lazy catch-up: rewind last_tick by 3 ticks → next read must run 3 ticks
await db.execute({ sql: "update meta set v=? where k='last_tick'", args: [String(w0.lastTick - 3 * w0.tickMs)] });
const [, w1] = await j('/world');
out['catch-up ran'] = { lastTickRestored: w1.lastTick === w0.lastTick, eventsBefore: w0.events, eventsAfter: w1.events };
out['cron without secret'] = (await j('/cron/tick'))[0];
out['cron with admin token (no CRON_SECRET set)'] = await j('/cron/tick', {}, { 'x-admin-token': 'dev' });
// demo guest flow
const S = 'test-' + Date.now();
const [, ad] = await j('/demo/adopt', { session: S }); const id = ad.tokenId;
const [, d] = await j(`/daemon/${id}?viewer=demo:${S}`);
out['adopted'] = { id, inherited: d.inherited, territory: d.territory, temperament: d.temperament, stance: d.stance };
const target = d.rels[0]?.other ?? (id === 777 ? 1 : 777);
out['order other daemon (403)'] = (await j('/order', { tokenId: target, card: 'raid', target: id, demo: true, demoSession: S }))[0];
out['bad card (400)'] = (await j('/order', { tokenId: id, card: 'nuke', target, demo: true, demoSession: S }))[0];
out['seal raid'] = await j('/order', { tokenId: id, card: 'raid', target, demo: true, demoSession: S });
const [, pub] = await j(`/daemon/${id}`); out['public sees sealed only'] = pub.order;
out['fast-forward'] = await j('/demo/fastforward', { session: S });
const [, me] = await j(`/me?session=${S}`); out['recap'] = me.recap.map((e: any) => e.line);
out['second order same day (409)'] = (await j('/order', { tokenId: id, card: 'ally', target, demo: true, demoSession: S }))[0];
const [, d2] = await j(`/daemon/${id}`); out['diary today'] = d2.diary[0]?.entries.map((e: any) => e.line).slice(0, 4);
out['signed order w/o signature (401)'] = (await j('/order', { tokenId: 42, card: 'raid', target: 1 }))[0];
const [, map] = await j('/map'); out['map'] = { tiles: map.owners.length, daemons: map.daemons.length, owners: new Set(map.owners).size };
console.log(JSON.stringify(out, null, 1));
