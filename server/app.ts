import { Hono } from 'hono';
import { randomBytes } from 'crypto';
import { isAddress, verifyMessage } from 'viem';
import { client as dbc, migrate, q, ConfigError } from './db.js';
import { act, verifyGiftTx, demoEnergyLeft, balanceOf, chogRow, client, CHOG_NFT, energyLeft, getMeta, getRel, loadMeta, nftAbi, relsOf, seedIfEmpty, warmMeta } from './engine.js';
import { ACTIONS, DEMO_OWNED, actionMessage, relLabel, title, type Action } from '../shared/stats.js';

const DEMO_MODE = process.env.DEMO_MODE !== '0';
const app = new Hono();
const ENV_NAMES = ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'ADMIN_TOKEN', 'DEMO_MODE', 'MONAD_RPC', 'DB_PATH'];
/** Health: reports which env vars are present (names only, never values) and whether the DB answers. */
app.get('/api/health', async c => {
  const env = Object.fromEntries(ENV_NAMES.map(n => [n, !!process.env[n]?.trim()]));
  let db: string = 'ok';
  try { await migrate(); await q.get(dbc, 'select 1 x'); } catch (e) { db = (e instanceof ConfigError ? '' : 'error: ') + (e as Error).message; }
  const ok = db === 'ok';
  return c.json({ ok, db, demo: DEMO_MODE, runtime: { node: process.version, vercel: !!process.env.VERCEL, region: process.env.VERCEL_REGION ?? null }, env }, ok ? 200 : 500);
});
app.onError((e, c) => {
  console.error('[api]', e);
  return c.json({ error: e instanceof ConfigError ? e.message : 'Internal error: ' + e.message, hint: 'GET /api/health for config status' }, 500);
});
let init: Promise<void> | undefined;
app.use('/api/*', async (_c, next) => { await (init ??= migrate().then(() => seedIfEmpty()).then(() => warmMeta()).catch(e => { init = undefined; throw e; })); await next(); });
const evRow = (r: any) => ({ id: r.id, t: r.t, actor: r.actor, target: r.target, action: r.action, success: !!r.success, text: r.text, repA: r.rep_a, repB: r.rep_b });
const summary = async (id: number) => { const r = await chogRow(id); return { tokenId: id, meta: getMeta(id), rep: r.rep, title: title(r.rep), energy: energyLeft(r), streak: r.streak_last && Date.now() - Date.parse(r.streak_last) < 2 * 864e5 ? r.streak_n : 0, achievements: JSON.parse(r.achievements) }; };

app.get('/api/world', async c => c.json({
  events: Number((await q.get(dbc, 'select count(*) n from events'))?.n),
  relationships: Number((await q.get(dbc, 'select count(*) n from rels'))?.n),
  season: Number((await q.get(dbc, "select v from meta where k='season'"))?.v || 1), demo: DEMO_MODE, demoOwned: DEMO_OWNED,
}));
app.get('/api/known', async c => c.json((await q.all(dbc, 'select token_id id from chogs')).map(r => Number(r.id)).concat(DEMO_OWNED).filter((v, i, a) => a.indexOf(v) === i && getMeta(v)).map(id => getMeta(id))));
app.get('/api/chogs', async c => {
  const ids = (c.req.query('ids') || '').split(',').map(Number).filter(n => n >= 1 && n <= 1969).slice(0, 50);
  for (const id of ids) await loadMeta(id).catch(() => {});
  return c.json(await Promise.all(ids.filter(getMeta).map(summary)));
});
app.get('/api/chogs/:id', async c => {
  const id = Number(c.req.param('id')); if (!(id >= 1 && id <= 1969)) return c.json({ error: 'bad tokenId' }, 400);
  try { await loadMeta(id); } catch { return c.json({ error: 'metadata unavailable' }, 502); }
  const rels = (await relsOf(id)).map(x => ({ ...x, label: relLabel(x.r), meta: getMeta(x.other) }))
    .sort((p, q) => Math.abs(q.r.bond) + q.r.duels * 10 - Math.abs(p.r.bond) - p.r.duels * 10);
  const events = (await q.all(dbc, 'select * from events where actor=? or target=? order by t desc limit 50', [id, id])).map(evRow);
  return c.json({ ...(await summary(id)), rels, events });
});
app.get('/api/rel/:a/:b', async c => { const r = await getRel(+c.req.param('a'), +c.req.param('b')); return c.json({ ...r, label: relLabel(r) }); });
app.get('/api/feed', async c => c.json((await q.all(dbc, 'select * from events order by t desc limit ?', [Math.min(200, Number(c.req.query('limit') || 50))])).map(evRow)));
app.get('/api/leaderboard', async c => c.json(await Promise.all((await q.all(dbc, 'select token_id from chogs order by rep desc limit 10')).map(r => summary(Number(r.token_id))))));
app.get('/api/demo-energy', async c => { const s = c.req.query('session') || ''; const ids = (c.req.query('ids') || '').split(',').map(Number).filter(Boolean); return c.json(Object.fromEntries(await Promise.all(ids.map(async i => [i, await demoEnergyLeft(s, i)])))); });
app.get('/api/balance/:owner', async c => c.json({ balance: await balanceOf(c.req.param('owner')) }));
app.get('/api/nonce', async c => {
  const address = c.req.query('address') || ''; if (!isAddress(address)) return c.json({ error: 'bad address' }, 400);
  const nonce = randomBytes(12).toString('hex');
  await q.run(dbc, 'insert into nonces values(?,?,?,0)', [nonce, address.toLowerCase(), Date.now()]);
  if (Math.random() < 0.05) await q.run(dbc, 'delete from nonces where created < ?', [Date.now() - 864e5]);
  return c.json({ nonce, issuedAt: Date.now() });
});
app.post('/api/action', async c => {
  const b = await c.req.json().catch(() => ({}));
  const tokenId = Number(b.tokenId), target = Number(b.target), action = b.action as Action;
  if (!(tokenId >= 1 && tokenId <= 1969 && target >= 1 && target <= 1969) || !ACTIONS.includes(action)) return c.json({ error: 'bad request' }, 400);
  let owner: string, signer: string | null = null, demoSession: string | undefined, giftTx: string | undefined;
  if (b.demo) {
    if (!DEMO_MODE) return c.json({ error: 'demo mode disabled' }, 403);
    if (!DEMO_OWNED.includes(tokenId)) return c.json({ error: 'demo mode only allows demo Chogs ' + DEMO_OWNED.join(', ') }, 403);
    const sess = String(b.demoSession || '');
    if (!/^[a-zA-Z0-9-]{8,64}$/.test(sess)) return c.json({ error: 'demoSession required' }, 400);
    owner = 'demo:' + sess; demoSession = sess;
  } else {
    const { address, nonce, issuedAt, signature, txHash } = b;
    if (action === 'gift' && !/^0x[0-9a-fA-F]{64}$/.test(txHash || '')) return c.json({ error: 'gift requires an on-chain $CHOG txHash' }, 400);
    if (!isAddress(address || '') || !signature) return c.json({ error: 'signature required' }, 401);
    const n = await q.get(dbc, 'select * from nonces where nonce=?', [String(nonce)]);
    if (!n || Number(n.used) || n.address !== address.toLowerCase() || Date.now() - Number(n.created) > 10 * 6e4) return c.json({ error: 'invalid or expired nonce' }, 401);
    if (Math.abs(Date.now() - Number(issuedAt)) > 10 * 6e4) return c.json({ error: 'stale signature' }, 401);
    const ok = await verifyMessage({ address, message: actionMessage({ tokenId, action, target, nonce, issuedAt: Number(issuedAt), tx: action === 'gift' ? txHash : undefined }), signature, }).catch(() => false);
    if (!ok) return c.json({ error: 'bad signature' }, 401);
    const upd = await dbc.execute({ sql: 'update nonces set used=1 where nonce=? and used=0', args: [nonce] }); if (!upd.rowsAffected) return c.json({ error: 'invalid or expired nonce' }, 401);
    try {
      const o = await client.readContract({ address: CHOG_NFT, abi: nftAbi, functionName: 'ownerOf', args: [BigInt(tokenId)] });
      if (o.toLowerCase() !== address.toLowerCase()) return c.json({ error: `Chog ${tokenId} is not owned by ${address}` }, 403);
    } catch (e) { return c.json({ error: 'ownerOf check failed: ' + (e as Error).message }, 502); }
    if (action === 'gift') {
      let targetOwner: string;
      try { targetOwner = await client.readContract({ address: CHOG_NFT, abi: nftAbi, functionName: 'ownerOf', args: [BigInt(target)] }); } catch { return c.json({ error: 'ownerOf(target) failed' }, 502); }
      const err = await verifyGiftTx(txHash, address, targetOwner); if (err) return c.json({ error: err }, 402);
      giftTx = txHash;
    }
    owner = address; signer = address;
  }
  try { await loadMeta(tokenId); await loadMeta(target); } catch { return c.json({ error: 'metadata unavailable' }, 502); }
  const r = await act(tokenId, target, action, { owner, signer, demoSession, giftTx });
  if (typeof r === 'string') return c.json({ error: r }, 409);
  return c.json({ event: r, balance: await balanceOf(owner), energy: demoSession ? await demoEnergyLeft(demoSession, tokenId) : undefined });
});
app.post('/api/admin/reset', async c => {
  if (!DEMO_MODE || c.req.header('x-admin-token') !== (process.env.ADMIN_TOKEN || 'dev')) return c.json({ error: 'forbidden' }, 403);
  await seedIfEmpty(true); return c.json({ ok: true });
});
export default app;
