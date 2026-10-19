import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { randomBytes } from 'crypto';
import { isAddress, verifyMessage } from 'viem';
import { db } from './db';
import { act, verifyGiftTx, demoEnergyLeft, balanceOf, chogRow, client, CHOG_NFT, energyLeft, getMeta, getRel, loadMeta, nftAbi, relsOf, seedIfEmpty } from './engine';
import { ACTIONS, DEMO_OWNED, actionMessage, relLabel, title, type Action } from '../shared/stats';

const DEMO_MODE = process.env.DEMO_MODE !== '0';
const PORT = Number(process.env.PORT || 8787);
seedIfEmpty();
const app = new Hono();
const evRow = (r: any) => ({ id: r.id, t: r.t, actor: r.actor, target: r.target, action: r.action, success: !!r.success, text: r.text, repA: r.rep_a, repB: r.rep_b });
const summary = (id: number) => { const r = chogRow(id); return { tokenId: id, meta: getMeta(id), rep: r.rep, title: title(r.rep), energy: energyLeft(r), streak: r.streak_last && Date.now() - Date.parse(r.streak_last) < 2 * 864e5 ? r.streak_n : 0, achievements: JSON.parse(r.achievements) }; };

app.get('/api/health', c => c.json({ ok: true, demo: DEMO_MODE }));
app.get('/api/world', c => c.json({
  events: (db.prepare('select count(*) n from events').get() as any).n,
  relationships: (db.prepare('select count(*) n from rels').get() as any).n,
  season: Number((db.prepare("select v from meta where k='season'").get() as any)?.v || 1), demo: DEMO_MODE, demoOwned: DEMO_OWNED,
}));
app.get('/api/known', c => c.json((db.prepare('select distinct token_id id from chogs').all() as any[]).map(r => r.id).concat(DEMO_OWNED).filter((v, i, a) => a.indexOf(v) === i && getMeta(v)).map(id => getMeta(id))));
app.get('/api/chogs', async c => {
  const ids = (c.req.query('ids') || '').split(',').map(Number).filter(n => n >= 1 && n <= 1969).slice(0, 50);
  for (const id of ids) await loadMeta(id).catch(() => {});
  return c.json(ids.filter(getMeta).map(summary));
});
app.get('/api/chogs/:id', async c => {
  const id = Number(c.req.param('id')); if (!(id >= 1 && id <= 1969)) return c.json({ error: 'bad tokenId' }, 400);
  try { await loadMeta(id); } catch { return c.json({ error: 'metadata unavailable' }, 502); }
  const rels = relsOf(id).map(x => ({ ...x, label: relLabel(x.r), meta: getMeta(x.other) }))
    .sort((p, q) => Math.abs(q.r.bond) + q.r.duels * 10 - Math.abs(p.r.bond) - p.r.duels * 10);
  const events = (db.prepare('select * from events where actor=? or target=? order by t desc limit 50').all(id, id) as any[]).map(evRow);
  return c.json({ ...summary(id), rels, events });
});
app.get('/api/rel/:a/:b', c => { const r = getRel(+c.req.param('a'), +c.req.param('b')); return c.json({ ...r, label: relLabel(r) }); });
app.get('/api/feed', c => c.json((db.prepare('select * from events order by t desc limit ?').all(Math.min(200, Number(c.req.query('limit') || 50))) as any[]).map(evRow)));
app.get('/api/leaderboard', c => c.json((db.prepare('select token_id from chogs order by rep desc limit 10').all() as any[]).map(r => summary(r.token_id))));
app.get('/api/demo-energy', c => { const s = c.req.query('session') || ''; const ids = (c.req.query('ids') || '').split(',').map(Number).filter(Boolean); return c.json(Object.fromEntries(ids.map(i => [i, demoEnergyLeft(s, i)]))); });
app.get('/api/balance/:owner', c => c.json({ balance: balanceOf(c.req.param('owner')) }));
app.get('/api/nonce', c => {
  const address = c.req.query('address') || ''; if (!isAddress(address)) return c.json({ error: 'bad address' }, 400);
  const nonce = randomBytes(12).toString('hex');
  db.prepare('insert into nonces values(?,?,?,0)').run(nonce, address.toLowerCase(), Date.now());
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
    const n = db.prepare('select * from nonces where nonce=?').get(nonce) as any;
    if (!n || n.used || n.address !== address.toLowerCase() || Date.now() - n.created > 10 * 6e4) return c.json({ error: 'invalid or expired nonce' }, 401);
    if (Math.abs(Date.now() - Number(issuedAt)) > 10 * 6e4) return c.json({ error: 'stale signature' }, 401);
    const ok = await verifyMessage({ address, message: actionMessage({ tokenId, action, target, nonce, issuedAt: Number(issuedAt), tx: action === 'gift' ? txHash : undefined }), signature, }).catch(() => false);
    if (!ok) return c.json({ error: 'bad signature' }, 401);
    db.prepare('update nonces set used=1 where nonce=?').run(nonce);
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
  const r = act(tokenId, target, action, { owner, signer, demoSession, giftTx });
  if (typeof r === 'string') return c.json({ error: r }, 409);
  return c.json({ event: r, balance: balanceOf(owner), energy: demoSession ? demoEnergyLeft(demoSession, tokenId) : undefined });
});
app.post('/api/admin/reset', c => {
  if (!DEMO_MODE || c.req.header('x-admin-token') !== (process.env.ADMIN_TOKEN || 'dev')) return c.json({ error: 'forbidden' }, 403);
  seedIfEmpty(true); return c.json({ ok: true });
});
// production: serve built frontend
app.use('/*', serveStatic({ root: './dist' }));
app.get('*', serveStatic({ path: './dist/index.html' }));
serve({ fetch: app.fetch, port: PORT }, i => console.log(`ChogChronicle API on :${i.port} (demo=${DEMO_MODE})`));
