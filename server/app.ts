import { Hono } from 'hono';
import { randomBytes, randomUUID } from 'crypto';
import { isAddress, verifyMessage } from 'viem';
import { client as dbc, migrate, q, ConfigError } from './db.js';
import { client, CHOG_NFT, getMeta, loadMeta, nftAbi, verifyGiftTx, warmMeta, balanceOf, DEMO } from './engine.js';
import { World } from './world.js';
import { adopt, catchUp, fastForward, guestOf, nextTickAt, placeOrder, seedIfNeeded } from './game.js';
import { relLabel } from '../shared/stats.js';
import { CARDS, CARD_INFO, TICK_MS, dayOf, diaryLine, orderMessage, perks, stance, temperament, tileName, type Card, type DEvent } from '../shared/daemons.js';

const DEMO_MODE = process.env.DEMO_MODE !== '0';
const TREASURY = process.env.TREASURY_ADDRESS?.trim();
const BOUNTY = 25;
const app = new Hono();
const ENV_NAMES = ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'ADMIN_TOKEN', 'CRON_SECRET', 'TREASURY_ADDRESS', 'DEMO_MODE', 'MONAD_RPC', 'DB_PATH'];
app.get('/api/health', async c => {
  const env = Object.fromEntries(ENV_NAMES.map(n => [n, !!process.env[n]?.trim()]));
  let db = 'ok';
  try { await migrate(); await q.get(dbc, 'select 1 x'); } catch (e) { db = (e instanceof ConfigError ? '' : 'error: ') + (e as Error).message; }
  const ok = db === 'ok';
  return c.json({ ok, db, demo: DEMO_MODE, runtime: { node: process.version, vercel: !!process.env.VERCEL, region: process.env.VERCEL_REGION ?? null }, env }, ok ? 200 : 500);
});
app.onError((e, c) => { console.error('[api]', e); return c.json({ error: e instanceof ConfigError ? e.message : 'Internal error: ' + e.message, hint: 'GET /api/health for config status' }, 500); });
let init: Promise<void> | undefined;
app.use('/api/*', async (c, next) => {
  await (init ??= migrate().then(() => warmMeta()).then(() => seedIfNeeded()).catch(e => { init = undefined; throw e; }));
  if (!c.req.path.startsWith('/api/cron')) await catchUp();
  await next();
});
const evRow = (r: any): DEvent => ({ id: r.id, t: Number(r.t), actor: Number(r.actor), target: Number(r.target), action: r.action, success: !!Number(r.success), text: r.text, repA: Number(r.rep_a), repB: Number(r.rep_b), data: r.data ? JSON.parse(r.data) : {} });
const card = (m: any) => m && { tokenId: m.tokenId, name: m.name, image: m.image };

app.get('/api/world', async c => {
  const [ev, dm, lt, season] = await Promise.all([q.get(dbc, 'select count(*) n from events'), q.get(dbc, 'select count(*) n from daemons where awake=1'), q.get(dbc, "select v from meta where k='last_tick'"), q.get(dbc, "select v from meta where k='season'")]);
  return c.json({ events: Number(ev?.n), daemons: Number(dm?.n), lastTick: Number(lt?.v), nextTick: Number(lt?.v) + TICK_MS, tickMs: TICK_MS, season: Number(season?.v || 1), demo: DEMO_MODE, now: Date.now(), treasury: TREASURY ?? null });
});
app.get('/api/map', async c => {
  const w = await World.load(); const terr = w.territory(); const owners: number[] = [];
  for (let t = 1; t <= 1969; t++) owners.push(w.owner(t));
  const daemons = w.awake().map(id => ({ ...card(getMeta(id)), id, rep: w.d(id).rep, fort: w.d(id).fort, territory: terr.get(id) ?? 0, cursed: w.d(id).curses.some(x => x.until > Date.now()) }));
  return c.json({ owners, daemons });
});
app.get('/api/known', c => c.json(DEMO.concat([...new Set<number>()].map(getMeta).filter(Boolean) as any)));
app.get('/api/leaderboard', async c => {
  const w = await World.load(); const terr = w.territory();
  return c.json(w.awake().map(id => ({ id, meta: card(getMeta(id)), territory: terr.get(id) ?? 0, rep: w.d(id).rep })).sort((a, b) => b.territory - a.territory || b.rep - a.rep).slice(0, 15));
});
app.get('/api/feed', async c => c.json((await q.all(dbc, 'select * from events order by t desc limit ?', [Math.min(200, Number(c.req.query('limit') || 50))])).map(evRow)));
app.get('/api/daemon/:id', async c => {
  const id = Number(c.req.param('id')); if (!(id >= 1 && id <= 1969)) return c.json({ error: 'bad tokenId' }, 400);
  const m = await loadMeta(id).catch(() => null); if (!m) return c.json({ error: 'metadata unavailable' }, 502);
  const viewer = (c.req.query('viewer') || '').toLowerCase();
  const w = await World.load(); const d = w.daemons.get(id); const terr = w.territory(); const tp = temperament(m);
  const rels = [...w.rels.entries()].map(([k, r]) => { const [a, b] = k.split('-').map(Number); return a === id || b === id ? { other: a === id ? b : a, r, label: relLabel(r) } : null; })
    .filter(Boolean).sort((x, y) => Math.abs(y!.r.bond) + y!.r.duels * 8 - Math.abs(x!.r.bond) - x!.r.duels * 8).slice(0, 10).map(x => ({ ...x!, meta: card(getMeta(x!.other)) }));
  const evs = (await q.all(dbc, 'select * from events where (actor=? or target=?) and t > ? order by t desc limit 80', [id, id, Date.now() - 8 * 864e5])).map(evRow);
  const byDay = new Map<string, { t: number; line: string; e: DEvent }[]>();
  for (const e of evs) { const line = diaryLine(e, id); if (!line) continue; const k = dayOf(e.t); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k)!.push({ t: e.t, line, e }); }
  const diary = [...byDay.entries()].map(([day, entries]) => ({ day, entries }));
  const today = w.orderOf(id, dayOf(Date.now()));
  const myOrder = today && (today.issuer.toLowerCase() === viewer || today.resolvedAt != null) ? today : today ? { sealed: true, source: today.source } : null;
  const bounties = (await q.all(dbc, 'select amount from bounties where target=? and claimed_by is null', [id])).reduce((a, b) => a + Number(b.amount), 0);
  return c.json({
    tokenId: id, meta: m, awake: !!d?.awake, rep: d?.rep ?? 100, fort: d?.fort ?? 0, territory: terr.get(id) ?? 0, home: tileName(id),
    curses: (d?.curses ?? []).filter(x => x.until > Date.now()), intel: (d?.intel ?? []).filter(x => x.until > Date.now()),
    temperament: tp, stance: stance(tp), perks: perks(tp), rels, inherited: d?.inherited ?? null, lastOwner: d?.lastOwner ?? null,
    order: myOrder, diary, bounty: bounties, nextTick: await nextTickAt(),
  });
});
// ---------- orders ----------
app.get('/api/nonce', async c => {
  const address = c.req.query('address') || ''; if (!isAddress(address)) return c.json({ error: 'bad address' }, 400);
  const nonce = randomBytes(12).toString('hex');
  await q.run(dbc, 'insert into nonces values(?,?,?,0)', [nonce, address.toLowerCase(), Date.now()]);
  if (Math.random() < 0.05) await q.run(dbc, 'delete from nonces where created < ?', [Date.now() - 864e5]);
  return c.json({ nonce, issuedAt: Date.now(), day: dayOf(Date.now()) });
});
/** Verify a signed wallet request; returns the signer or an error response tuple. */
async function verifySigned(b: any, msg: string): Promise<string | [string, number]> {
  const { address, nonce, issuedAt, signature } = b;
  if (!isAddress(address || '') || !signature) return ['signature required', 401];
  const n = await q.get(dbc, 'select * from nonces where nonce=?', [String(nonce)]);
  if (!n || Number(n.used) || n.address !== address.toLowerCase() || Date.now() - Number(n.created) > 10 * 6e4) return ['invalid or expired nonce', 401];
  if (Math.abs(Date.now() - Number(issuedAt)) > 10 * 6e4) return ['stale signature', 401];
  if (!(await verifyMessage({ address, message: msg, signature }).catch(() => false))) return ['bad signature', 401];
  const upd = await dbc.execute({ sql: 'update nonces set used=1 where nonce=? and used=0', args: [nonce] }); if (!upd.rowsAffected) return ['invalid or expired nonce', 401];
  return address;
}
app.post('/api/order', async c => {
  const b = await c.req.json().catch(() => ({}));
  const tokenId = Number(b.tokenId), target = Number(b.target || 0), cardName = b.card as Card;
  if (!(tokenId >= 1 && tokenId <= 1969) || !CARDS.includes(cardName) || (CARD_INFO[cardName].target && !(target >= 1 && target <= 1969 && target !== tokenId))) return c.json({ error: 'bad request' }, 400);
  let issuer: string, source: string;
  if (b.demo) {
    if (!DEMO_MODE) return c.json({ error: 'demo mode disabled' }, 403);
    const g = await guestOf(String(b.demoSession || '')); if (!g || Number(g.token_id) !== tokenId) return c.json({ error: 'In demo mode you can only command your adopted guest daemon.' }, 403);
    issuer = 'demo:' + b.demoSession; source = 'guest';
  } else {
    const day = dayOf(Date.now());
    const s = await verifySigned(b, orderMessage({ tokenId, card: cardName, target, day, nonce: b.nonce, issuedAt: Number(b.issuedAt) }));
    if (Array.isArray(s)) return c.json({ error: s[0] }, s[1] as 401);
    let owner: string;
    try { owner = await client.readContract({ address: CHOG_NFT, abi: nftAbi, functionName: 'ownerOf', args: [BigInt(tokenId)] }); } catch (e) { return c.json({ error: 'ownerOf check failed: ' + (e as Error).message }, 502); }
    if (owner.toLowerCase() !== s.toLowerCase()) return c.json({ error: `Chog ${tokenId} is not owned by ${s}` }, 403);
    await loadMeta(tokenId).catch(() => {});
    // wake + inherited memory on owner change
    const w = await World.load(); const d = w.daemons.get(tokenId); const isNew = !d?.awake; const dd = w.wake(tokenId);
    if (dd.lastOwner && dd.lastOwner.toLowerCase() !== s.toLowerCase()) {
      const terr = w.territory(); const rivals = [...w.rels.entries()].filter(([k, r]) => k.split('-').map(Number).includes(tokenId) && r.bond <= -30).length;
      dd.inherited = { from: dd.lastOwner, at: Date.now(), rivals, tiles: terr.get(tokenId) ?? 0, curses: dd.curses.filter(x => x.until > Date.now()).map(x => x.name), rep: dd.rep };
    }
    if (isNew || dd.lastOwner?.toLowerCase() !== s.toLowerCase()) { dd.lastOwner = s; w.dirtyD.add(tokenId); await w.persist(); }
    issuer = s.toLowerCase(); source = 'owner';
  }
  const r = await placeOrder(tokenId, cardName, target, source, issuer);
  if ('error' in r) return c.json({ error: r.error }, 409);
  return c.json({ ok: true, day: r.day, nextTick: await nextTickAt() });
});
// ---------- demo guests ----------
const sess = (s: unknown) => (/^[a-zA-Z0-9-]{8,64}$/.test(String(s || '')) ? String(s) : null);
app.post('/api/demo/adopt', async c => {
  if (!DEMO_MODE) return c.json({ error: 'demo mode disabled' }, 403);
  const b = await c.req.json().catch(() => ({})); const s = sess(b.session); if (!s) return c.json({ error: 'session required' }, 400);
  return c.json({ tokenId: await adopt(s, !!b.reroll) });
});
app.get('/api/me', async c => {
  const s = sess(c.req.query('session')); if (!s) return c.json({ error: 'session required' }, 400);
  const g = await guestOf(s); if (!g) return c.json({ tokenId: null });
  const id = Number(g.token_id); const since = Number(g.last_seen);
  const recap = (await q.all(dbc, 'select * from events where (actor=? or target=?) and t > ? order by t asc limit 30', [id, id, since])).map(evRow).map(e => ({ ...e, line: diaryLine(e, id) }));
  return c.json({ tokenId: id, adoptedAt: Number(g.adopted_at), lastSeen: since, recap, balance: await balanceOf('demo:' + s) });
});
app.post('/api/me/seen', async c => {
  const b = await c.req.json().catch(() => ({})); const s = sess(b.session); if (!s) return c.json({ error: 'session required' }, 400);
  await q.run(dbc, 'update guests set last_seen=? where session=?', [Number(b.at) || Date.now(), s]); return c.json({ ok: true });
});
app.post('/api/demo/fastforward', async c => {
  if (!DEMO_MODE) return c.json({ error: 'demo mode disabled' }, 403);
  const b = await c.req.json().catch(() => ({})); const s = sess(b.session); if (!s) return c.json({ error: 'session required' }, 400);
  const r = await fastForward(s); return c.json(r, 'error' in r ? 409 : 200);
});
// ---------- $CHOG bounties ----------
app.post('/api/bounty', async c => {
  const b = await c.req.json().catch(() => ({})); const target = Number(b.target);
  if (!(target >= 1 && target <= 1969)) return c.json({ error: 'bad target' }, 400);
  let poster: string, tx: string | null = null;
  if (b.demo) {
    const s = sess(b.session); if (!DEMO_MODE || !s) return c.json({ error: 'demo session required' }, 400);
    poster = 'demo:' + s; const bal = await balanceOf(poster); if (bal < BOUNTY) return c.json({ error: 'Not enough demo $CHOG' }, 409);
    await q.run(dbc, 'insert into balances(owner, bal) values(?, ?) on conflict(owner) do update set bal = bal - ?', [poster, 500 - BOUNTY, BOUNTY]);
  } else {
    if (!TREASURY) return c.json({ error: 'On-chain bounties are not enabled (TREASURY_ADDRESS not set).' }, 400);
    if (!/^0x[0-9a-fA-F]{64}$/.test(b.txHash || '')) return c.json({ error: 'txHash required' }, 400);
    const s = await verifySigned(b, orderMessage({ tokenId: 0, card: 'bounty', target, day: dayOf(Date.now()), nonce: b.nonce, issuedAt: Number(b.issuedAt), tx: b.txHash }));
    if (Array.isArray(s)) return c.json({ error: s[0] }, s[1] as 401);
    const err = await verifyGiftTx(b.txHash, s, TREASURY); if (err) return c.json({ error: err }, 402);
    await q.run(dbc, 'insert into used_tx values(?,?,?)', [b.txHash.toLowerCase(), 'bounty', Date.now()]);
    poster = s.toLowerCase(); tx = b.txHash;
  }
  await q.run(dbc, 'insert into bounties(id, target, amount, poster, created, tx) values(?,?,?,?,?,?)', [randomUUID(), target, BOUNTY, poster, Date.now(), tx]);
  return c.json({ ok: true, balance: await balanceOf(poster) });
});
app.get('/api/balance/:owner', async c => c.json({ balance: await balanceOf(c.req.param('owner')) }));
// ---------- ticks ----------
const cronAuthorized = (c: any) => { const sec = process.env.CRON_SECRET?.trim(); const h = c.req.header('authorization'); return sec ? h === `Bearer ${sec}` : c.req.header('x-admin-token') === (process.env.ADMIN_TOKEN || 'dev'); };
const cron = async (c: any) => cronAuthorized(c) ? c.json(await catchUp()) : c.json({ error: 'forbidden' }, 403);
app.get('/api/cron/tick', cron); app.post('/api/cron/tick', cron);
app.post('/api/admin/reset', async c => {
  if (!DEMO_MODE || c.req.header('x-admin-token') !== (process.env.ADMIN_TOKEN || 'dev')) return c.json({ error: 'forbidden' }, 403);
  await seedIfNeeded(true); return c.json({ ok: true });
});
export default app;
