/**
 * Pacts (co-signed, $CHOG-staked friend oaths) + Witnesses (live Square, third-party verification).
 * Purely additive: own tables, own routes; hooks into existing actions only via afterAction().
 */
import type { Hono } from 'hono';
import { randomUUID } from 'crypto';
import { isAddress, verifyMessage, parseAbi, parseEventLogs } from 'viem';
import { client as dbc, q, tx, type Exec } from './db.js';
import { balanceOf, chogDecimals, chogRow, client, CHOG_NFT, getMeta, getRel, loadMeta, nftAbi } from './engine.js';
import { CHOG_TOKEN, DEMO_OWNED, relLabel, type Event } from '../shared/stats.js';
import { DEMO_MINUTES_PER_DAY, STAKES, TIERS, WITNESS_REP, WITNESS_WINDOW_MS, pactMessage, tierFor, witnessMessage, type Pact } from '../shared/pacts.js';

const DEMO_MODE = process.env.DEMO_MODE !== '0';
const ESCROW = (process.env.PACT_ESCROW_ADDRESS || '').trim();
const MODE: 'escrow' | 'pledge' = isAddress(ESCROW) ? 'escrow' : 'pledge';
const CORE = "('challenge','befriend','prank','gift')";
const SCHEMA = [
  `create table if not exists pacts(id text primary key, a integer, b integer, stake integer, tier text, score integer, status text, created integer, accepted integer, ends integer,
    demo integer, mode text, a_owner text, b_owner text, a_tx text, b_tx text, betrayer integer, owed_to text, pot integer default 0)`,
  `create index if not exists pacts_a on pacts(a)`, `create index if not exists pacts_b on pacts(b)`, `create index if not exists pacts_status on pacts(status)`,
  `create table if not exists witnesses(event_id text, witness integer, owner text, t integer, primary key(event_id, witness))`,
  `create index if not exists wit_t on witnesses(t desc)`,
  `create table if not exists ev_owner(event_id text primary key, owner text)`,
  `create table if not exists presence(token_id integer primary key, seen integer)`,
];
let ready: Promise<void> | undefined;
const migrate = () => ready ??= dbc.batch(SCHEMA, 'write').then(() => {}).catch(e => { ready = undefined; throw e; });

const nm = (id: number) => getMeta(id)?.name.replace('CHOG ', 'Chog ') ?? `Chog #${id}`;
const pactRow = (r: any): Pact => ({ id: r.id, a: Number(r.a), b: Number(r.b), stake: Number(r.stake), tier: r.tier, score: Number(r.score), status: r.status, created: Number(r.created),
  accepted: r.accepted == null ? null : Number(r.accepted), ends: r.ends == null ? null : Number(r.ends), demo: !!Number(r.demo), mode: r.mode, betrayer: r.betrayer == null ? null : Number(r.betrayer),
  owedTo: r.owed_to ? (String(r.owed_to).startsWith('demo:') ? 'demo wallet' : r.owed_to) : null, pot: Number(r.pot) });
const addEvent = (x: Exec, actor: number, target: number, action: string, text: string, repA: number, repB: number, t = Date.now()) =>
  q.run(x, 'insert into events values(?,?,?,?,?,?,?,?,?,?)', [randomUUID(), t, actor, target, action, 1, text, repA, repB, null]);
const credit = async (x: Exec, owner: string, amt: number) => q.run(x, 'insert or replace into balances values(?,?)', [owner.toLowerCase(), (await balanceOf(owner, x)) + amt]);
async function badge(x: Exec, id: number, ...names: string[]) {
  const row = await chogRow(id, x); const has = new Set<string>(JSON.parse(row.achievements)); names.forEach(n => has.add(n));
  await q.run(x, 'update chogs set achievements=? where token_id=?', [JSON.stringify([...has]), id]);
}
/** Witnessed events count double toward count-based achievements. */
async function unlockWeighted(x: Exec, id: number) {
  const c = await q.get<any>(x, `select
      sum(case when action='prank' and success=1 then 1 + (select count(*)>0 from witnesses w where w.event_id=e.id) else 0 end) p,
      sum(case when action='challenge' and success=1 then 1 + (select count(*)>0 from witnesses w where w.event_id=e.id) else 0 end) wn,
      sum(case when action='gift' then 1 else 0 end) g from events e where actor=?`, [id]);
  const extra: string[] = [];
  if (Number(c?.p ?? 0) >= 3) extra.push('Chaos Agent');
  if (Number(c?.wn ?? 0) > 0) extra.push('First Blood');
  if (Number(c?.g ?? 0) > 0) extra.push('Generous Soul');
  if (extra.length) await badge(x, id, ...extra);
}
/** Shared history score between two Chogs: events count 1, witnessed events count 2. */
export async function pairScore(a: number, b: number, x: Exec = dbc) {
  const r = await q.get<any>(x, `select count(*) n, sum((select count(*)>0 from witnesses w where w.event_id=e.id)) w from events e
    where action in ${CORE} and ((actor=? and target=?) or (actor=? and target=?))`, [a, b, b, a]);
  const n = Number(r?.n ?? 0), w = Number(r?.w ?? 0); return { events: n, witnessed: w, score: n + w };
}
const openPact = (a: number, b: number, x: Exec = dbc) => q.get<any>(x, `select * from pacts where status in ('pending','active') and ((a=? and b=?) or (a=? and b=?))`, [a, b, b, a]);
/** Lazily settle pacts whose term ended without betrayal → Sworn, stakes returned. */
export async function settle() {
  const due = await q.all<any>(dbc, "select id from pacts where status='active' and ends <= ?", [Date.now()]);
  for (const d of due) await tx(async x => {
    const p = await q.get<any>(x, "select * from pacts where id=? and status='active'", [d.id]); if (!p) return;
    await q.run(x, "update pacts set status='sworn' where id=?", [p.id]);
    if (Number(p.demo)) { await credit(x, p.a_owner, Number(p.stake)); await credit(x, p.b_owner, Number(p.stake)); }
    await q.run(x, 'update chogs set rep=rep+10 where token_id in (?,?)', [p.a, p.b]);
    await addEvent(x, Number(p.a), Number(p.b), 'sworn', `${nm(p.a)} and ${nm(p.b)} kept their ${p.tier} Pact to the end. Both are now Sworn. Stakes returned.`, 10, 10, Number(p.ends));
    await badge(x, Number(p.a), 'Sworn'); await badge(x, Number(p.b), 'Sworn');
  });
}
/** Called after every successful core action: record who acted, detect Betrayal. */
export async function afterAction(ev: Event, owner: string) {
  await migrate();
  await q.run(dbc, 'insert or ignore into ev_owner values(?,?)', [ev.id, owner.toLowerCase()]);
  if (ev.action !== 'challenge' && ev.action !== 'prank') return null;
  await settle();
  return tx(async x => {
    const p = await q.get<any>(x, `select * from pacts where status='active' and ((a=? and b=?) or (a=? and b=?))`, [ev.actor, ev.target, ev.target, ev.actor]);
    if (!p) return null;
    const victim = ev.target, victimOwner = Number(p.a) === victim ? p.a_owner : p.b_owner;
    await q.run(x, "update pacts set status='betrayed', betrayer=?, owed_to=? where id=?", [ev.actor, victimOwner, p.id]);
    if (Number(p.demo)) await credit(x, victimOwner, Number(p.pot));
    await q.run(x, 'update chogs set rep=rep-20 where token_id=?', [ev.actor]);
    await q.run(x, 'update chogs set rep=rep+8 where token_id=?', [victim]);
    const how = p.mode === 'demo' ? 'paid to' : p.mode === 'escrow' ? 'owed from escrow to' : 'pledged and now owed to';
    await addEvent(x, ev.actor, victim, 'betrayal', `BETRAYAL. ${nm(ev.actor)} broke a ${p.tier} Pact by turning on ${nm(victim)}. The ${p.pot} $CHOG pot is ${how} ${nm(victim)}'s owner.`, -20, 8);
    await badge(x, ev.actor, 'Oathbreaker'); await badge(x, victim, 'Betrayed');
    return { pactId: p.id as string, pot: Number(p.pot) };
  });
}

// ---- auth helpers (same scheme as /api/action: DB nonce + EIP-191 + ownerOf) ----
type Auth = { owner: string; demo: boolean; demoSession?: string } | { error: string; status: number };
async function auth(b: any, tokenId: number, message: (n: string, t: number) => string, demoAny = false): Promise<Auth> {
  if (b.demo) {
    if (!DEMO_MODE) return { error: 'demo mode disabled', status: 403 };
    if (!demoAny && !DEMO_OWNED.includes(tokenId)) return { error: 'demo mode only allows demo Chogs ' + DEMO_OWNED.join(', '), status: 403 };
    const s = String(b.demoSession || ''); if (!/^[a-zA-Z0-9-]{8,64}$/.test(s)) return { error: 'demoSession required', status: 400 };
    return { owner: 'demo:' + s, demo: true, demoSession: s };
  }
  const { address, nonce, issuedAt, signature } = b;
  if (!isAddress(address || '') || !signature) return { error: 'signature required', status: 401 };
  const n = await q.get(dbc, 'select * from nonces where nonce=?', [String(nonce)]);
  if (!n || Number(n.used) || n.address !== address.toLowerCase() || Date.now() - Number(n.created) > 10 * 6e4) return { error: 'invalid or expired nonce', status: 401 };
  if (Math.abs(Date.now() - Number(issuedAt)) > 10 * 6e4) return { error: 'stale signature', status: 401 };
  const ok = await verifyMessage({ address, message: message(String(nonce), Number(issuedAt)), signature }).catch(() => false);
  if (!ok) return { error: 'bad signature', status: 401 };
  const upd = await dbc.execute({ sql: 'update nonces set used=1 where nonce=? and used=0', args: [nonce] }); if (!upd.rowsAffected) return { error: 'invalid or expired nonce', status: 401 };
  try {
    const o = await client.readContract({ address: CHOG_NFT, abi: nftAbi, functionName: 'ownerOf', args: [BigInt(tokenId)] });
    if (o.toLowerCase() !== address.toLowerCase()) return { error: `Chog ${tokenId} is not owned by ${address}`, status: 403 };
  } catch (e) { return { error: 'ownerOf check failed: ' + (e as Error).message, status: 502 }; }
  return { owner: address.toLowerCase(), demo: false };
}
const erc20 = parseAbi(['event Transfer(address indexed from, address indexed to, uint256 value)']);
async function verifyStake(hash: string, from: string, amount: number): Promise<string | null> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) return 'stake requires an on-chain $CHOG txHash';
  if (await q.get(dbc, 'select 1 from used_tx where hash=?', [hash.toLowerCase()])) return 'Stake transaction already used.';
  let rc; for (let i = 0; i < 10 && !rc; i++) { try { rc = await client.getTransactionReceipt({ hash: hash as `0x${string}` }); } catch { await new Promise(r => setTimeout(r, 1000)); } }
  if (!rc) return 'Transaction receipt not found on Monad.'; if (rc.status !== 'success') return 'Stake transaction reverted.';
  const need = BigInt(amount) * 10n ** BigInt(await chogDecimals());
  const ok = parseEventLogs({ abi: erc20, logs: rc.logs, eventName: 'Transfer' }).some(l => l.address.toLowerCase() === CHOG_TOKEN.toLowerCase() && l.args.from.toLowerCase() === from.toLowerCase() && l.args.to.toLowerCase() === ESCROW.toLowerCase() && l.args.value >= need);
  return ok ? null : `No ${amount} $CHOG Transfer from ${from} to the Pact escrow in that tx.`;
}
const isFriend = (label: string) => label === 'Friend' || label === 'Sworn Ally';
const termMs = (days: number, demo: boolean) => demo ? days * DEMO_MINUTES_PER_DAY * 6e4 : days * 864e5;

export function registerPacts(app: Hono) {
  app.use('/api/*', async (_c, next) => { await migrate(); await next(); });
  app.get('/api/pact-config', c => c.json({ mode: MODE, escrow: MODE === 'escrow' ? ESCROW : null, tiers: TIERS, stakes: STAKES, demoMinutesPerDay: DEMO_MINUTES_PER_DAY, witnessWindowMs: WITNESS_WINDOW_MS }));
  app.get('/api/pact-preview/:a/:b', async c => {
    const a = Number(c.req.param('a')), b = Number(c.req.param('b')); if (!(a >= 1 && a <= 1969 && b >= 1 && b <= 1969) || a === b) return c.json({ error: 'bad tokenIds' }, 400);
    const rel = await getRel(a, b); const label = relLabel(rel); const s = await pairScore(a, b); const open = await openPact(a, b);
    return c.json({ ...s, bond: rel.bond, label, friends: isFriend(label.label), tier: tierFor(s.score), open: open ? pactRow(open) : null });
  });
  app.get('/api/pacts', async c => {
    await settle();
    const ids = (c.req.query('ids') || '').split(',').map(Number).filter(n => n >= 1 && n <= 1969).slice(0, 50);
    const mine = ids.length ? await q.all(dbc, `select * from pacts where a in (${ids.map(() => '?').join(',')}) or b in (${ids.map(() => '?').join(',')}) order by created desc limit 50`, [...ids, ...ids]) : [];
    const open = await q.all(dbc, "select * from pacts where status in ('pending','active') order by created desc limit 30");
    const recent = await q.all(dbc, "select * from pacts where status in ('sworn','betrayed') order by coalesce(ends, created) desc limit 10");
    return c.json({ mine: mine.map(pactRow), open: open.map(pactRow), recent: recent.map(pactRow), mode: MODE, now: Date.now() });
  });
  app.post('/api/pact/propose', async c => {
    const b = await c.req.json().catch(() => ({})); const tokenId = Number(b.tokenId), partner = Number(b.partner), stake = Number(b.stake);
    if (!(tokenId >= 1 && tokenId <= 1969 && partner >= 1 && partner <= 1969) || tokenId === partner || !STAKES.includes(stake)) return c.json({ error: 'bad request' }, 400);
    const au = await auth(b, tokenId, (nonce, issuedAt) => pactMessage({ op: 'propose', tokenId, partner, stake, nonce, issuedAt, tx: b.txHash }));
    if ('error' in au) return c.json({ error: au.error }, au.status as any);
    try { await loadMeta(tokenId); await loadMeta(partner); } catch { return c.json({ error: 'metadata unavailable' }, 502); }
    const label = relLabel(await getRel(tokenId, partner)); if (!isFriend(label.label)) return c.json({ error: `Pacts are for friends only. ${nm(tokenId)} and ${nm(partner)} are ${label.label}s. Befriend first.` }, 409);
    const s = await pairScore(tokenId, partner); const tier = tierFor(s.score);
    if (stake > tier.maxStake) return c.json({ error: `${tier.name} tier allows up to ${tier.maxStake} $CHOG. Build more (witnessed) history to unlock bigger Pacts.` }, 409);
    const mode = au.demo ? 'demo' : MODE;
    if (mode === 'escrow') { const e = await verifyStake(String(b.txHash || ''), au.owner, stake); if (e) return c.json({ error: e }, 402); }
    const r = await tx(async x => {
      if (await openPact(tokenId, partner, x)) return 'These two Chogs already have an open Pact.';
      if (au.demo) { const bal = await balanceOf(au.owner, x); if (bal < stake) return 'Not enough $CHOG.'; await credit(x, au.owner, -stake); }
      const id = randomUUID().slice(0, 8);
      await q.run(x, 'insert into pacts values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [id, tokenId, partner, stake, tier.name, s.score, 'pending', Date.now(), null, null, au.demo ? 1 : 0, mode, au.owner, null, b.txHash ?? null, null, null, null, stake]);
      if (mode === 'escrow') await q.run(x, 'insert into used_tx values(?,?,?)', [String(b.txHash).toLowerCase(), 'pact:' + id, Date.now()]);
      return pactRow(await q.get(x, 'select * from pacts where id=?', [id]));
    });
    if (typeof r === 'string') return c.json({ error: r }, 409);
    return c.json({ pact: r, balance: await balanceOf(au.owner) });
  });
  app.post('/api/pact/accept', async c => {
    const b = await c.req.json().catch(() => ({})); const p0 = await q.get<any>(dbc, 'select * from pacts where id=?', [String(b.pactId || '')]);
    if (!p0) return c.json({ error: 'pact not found' }, 404); if (p0.status !== 'pending') return c.json({ error: 'pact is not pending' }, 409);
    const partner = Number(p0.b), stake = Number(p0.stake), demo = !!Number(p0.demo);
    if (demo !== !!b.demo) return c.json({ error: demo ? 'this is a demo pact: accept in demo mode' : 'this pact needs a wallet co-signature' }, 409);
    // Demo: partner may be any Chog (demo co-sign from any session). Real: must own the partner Chog.
    const au = await auth(b, partner, (nonce, issuedAt) => pactMessage({ op: 'accept', tokenId: partner, partner: Number(p0.a), stake, pactId: p0.id, nonce, issuedAt, tx: b.txHash }), true);
    if ('error' in au) return c.json({ error: au.error }, au.status as any);
    if (p0.mode === 'escrow') { const e = await verifyStake(String(b.txHash || ''), au.owner, stake); if (e) return c.json({ error: e }, 402); }
    const r = await tx(async x => {
      const p = await q.get<any>(x, "select * from pacts where id=? and status='pending'", [p0.id]); if (!p) return 'pact is not pending';
      if (au.demo) { const bal = await balanceOf(au.owner, x); if (bal < stake) return 'Not enough $CHOG.'; await credit(x, au.owner, -stake); }
      const tier = TIERS.find(t => t.name === p.tier)!; const now = Date.now();
      await q.run(x, "update pacts set status='active', accepted=?, ends=?, b_owner=?, b_tx=?, pot=? where id=?", [now, now + termMs(tier.days, demo), au.owner, b.txHash ?? null, stake * 2, p.id]);
      if (p.mode === 'escrow') await q.run(x, 'insert into used_tx values(?,?,?)', [String(b.txHash).toLowerCase(), 'pact:' + p.id, now]);
      await addEvent(x, Number(p.a), Number(p.b), 'pact', `${nm(p.a)} and ${nm(p.b)} sealed a ${p.tier} Pact: ${stake * 2} $CHOG on the line for ${tier.days} day${tier.days > 1 ? 's' : ''}. Turn on each other and lose it all.`, 0, 0, now);
      return pactRow(await q.get(x, 'select * from pacts where id=?', [p.id]));
    });
    if (typeof r === 'string') return c.json({ error: r }, 409);
    return c.json({ pact: r, balance: await balanceOf(au.owner) });
  });
  app.post('/api/pact/cancel', async c => {
    const b = await c.req.json().catch(() => ({})); const p = await q.get<any>(dbc, "select * from pacts where id=? and status='pending'", [String(b.pactId || '')]);
    if (!p) return c.json({ error: 'pending pact not found' }, 404);
    if (!Number(p.demo)) return c.json({ error: 'wallet pacts expire on their own; cancel is demo-only' }, 409);
    if (!b.demo || p.a_owner !== 'demo:' + String(b.demoSession || '')) return c.json({ error: 'only the proposer can cancel' }, 403);
    await tx(async x => { await q.run(x, "update pacts set status='cancelled' where id=?", [p.id]); await credit(x, p.a_owner, Number(p.stake)); });
    return c.json({ ok: true });
  });
  // ---- Witnesses / Square ----
  app.post('/api/presence', async c => {
    const b = await c.req.json().catch(() => ({})); const ids = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter((n: number) => n >= 1 && n <= 1969).slice(0, 10);
    for (const id of ids) await q.run(dbc, 'insert or replace into presence values(?,?)', [id, Date.now()]);
    return c.json({ ok: true });
  });
  app.get('/api/square', async c => {
    await settle(); const now = Date.now();
    const evs = await q.all<any>(dbc, 'select * from events order by t desc limit 40');
    const ws = evs.length ? await q.all<any>(dbc, `select event_id, witness, t from witnesses where event_id in (${evs.map(() => '?').join(',')}) order by t`, evs.map(e => e.id)) : [];
    const online = (await q.all<any>(dbc, 'select token_id from presence where seen > ? order by seen desc limit 40', [now - 45e3])).map(r => Number(r.token_id));
    for (const id of online) await loadMeta(id).catch(() => {});
    const active = Number((await q.get<any>(dbc, "select count(*) n from pacts where status='active'"))?.n ?? 0);
    return c.json({ now, windowMs: WITNESS_WINDOW_MS, online: online.map(id => getMeta(id)).filter(Boolean), activePacts: active,
      events: evs.map(r => ({ id: r.id, t: Number(r.t), actor: Number(r.actor), target: Number(r.target), action: r.action, success: !!Number(r.success), text: r.text, repA: Number(r.rep_a), repB: Number(r.rep_b),
        witnesses: ws.filter(w => w.event_id === r.id).map(w => Number(w.witness)) })) });
  });
  app.post('/api/witness', async c => {
    const b = await c.req.json().catch(() => ({})); const tokenId = Number(b.tokenId), eventId = String(b.eventId || '');
    if (!(tokenId >= 1 && tokenId <= 1969) || !eventId) return c.json({ error: 'bad request' }, 400);
    const ev = await q.get<any>(dbc, 'select * from events where id=?', [eventId]); if (!ev) return c.json({ error: 'event not found' }, 404);
    if (!/^(challenge|befriend|prank|gift|pact)$/.test(ev.action)) return c.json({ error: 'this entry cannot be witnessed' }, 409);
    if (Date.now() - Number(ev.t) > WITNESS_WINDOW_MS) return c.json({ error: 'Too late: moments can only be witnessed within 10 minutes.' }, 409);
    if (tokenId === Number(ev.actor) || tokenId === Number(ev.target)) return c.json({ error: 'A Chog cannot witness its own moment.' }, 409);
    const au = await auth(b, tokenId, (nonce, issuedAt) => witnessMessage({ tokenId, eventId, nonce, issuedAt }));
    if ('error' in au) return c.json({ error: au.error }, au.status as any);
    const eo = await q.get<any>(dbc, 'select owner from ev_owner where event_id=?', [eventId]);
    if (eo && eo.owner === au.owner.toLowerCase()) return c.json({ error: 'You cannot witness your own moment. Another owner has to see it.' }, 409);
    await loadMeta(tokenId).catch(() => {});
    const r = await tx(async x => {
      if (await q.get(x, 'select 1 from witnesses where event_id=? and witness=?', [eventId, tokenId])) return 'Already witnessed by this Chog.';
      await q.run(x, 'insert into witnesses values(?,?,?,?)', [eventId, tokenId, au.owner.toLowerCase(), Date.now()]);
      await chogRow(tokenId, x); await q.run(x, 'update chogs set rep=rep+? where token_id=?', [WITNESS_REP, tokenId]);
      await badge(x, tokenId, 'Witness'); await badge(x, Number(ev.actor), 'Seen');
      await unlockWeighted(x, Number(ev.actor)); await unlockWeighted(x, Number(ev.target));
      return (await q.all<any>(x, 'select witness from witnesses where event_id=? order by t', [eventId])).map(w => Number(w.witness));
    });
    if (typeof r === 'string') return c.json({ error: r }, 409);
    return c.json({ ok: true, witnesses: r, rep: WITNESS_REP });
  });
}
