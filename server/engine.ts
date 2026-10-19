import { randomUUID } from 'crypto';
import { q, tx, client as dbc, type Exec } from './db.js';
import { stats, relLabel, ENERGY, type Action, type Chog, type Event, type Rel } from '../shared/stats.js';
import { DEMO_CHOGS } from '../shared/demoChogs.js';
import { createPublicClient, http, parseAbi, parseEventLogs } from 'viem';
export const RPC = process.env.MONAD_RPC || 'https://rpc.monad.xyz';
export const CHOG_NFT = '0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763' as const;
export const client = createPublicClient({ transport: http(RPC) });
export const nftAbi = parseAbi(['function tokenURI(uint256) view returns (string)', 'function ownerOf(uint256) view returns (address)']);
const G = 'https://gateway.pinata.cloud/ipfs/';
export const DEMO: Chog[] = DEMO_CHOGS;
const metaCache = new Map<number, Chog>(DEMO.map(c => [c.tokenId, c]));
let metaLoaded = false;
export async function warmMeta() { if (metaLoaded) return; metaLoaded = true; for (const r of await q.all<{ json: string }>(dbc, 'select json from metadata')) { const c = JSON.parse(r.json); metaCache.set(c.tokenId, c); } }
export const getMeta = (id: number) => metaCache.get(id);
export async function loadMeta(id: number): Promise<Chog> {
  const hit = metaCache.get(id); if (hit) return hit;
  const uri = await client.readContract({ address: CHOG_NFT, abi: nftAbi, functionName: 'tokenURI', args: [BigInt(id)] });
  const m = await (await fetch(uri.replace('ipfs://', G))).json();
  const c: Chog = { tokenId: id, name: m.name, image: m.image.replace('ipfs://', G), attributes: m.attributes };
  metaCache.set(id, c); await q.run(dbc, 'insert or replace into metadata values(?,?)', [id, JSON.stringify(c)]); return c;
}
const today = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
type Row = { token_id: number; rep: number; energy_day: string | null; energy_used: number; streak_last: string | null; streak_n: number; achievements: string };
export async function chogRow(id: number, x: Exec = dbc): Promise<Row> {
  await q.run(x, 'insert or ignore into chogs(token_id) values(?)', [id]);
  return (await q.get<Row>(x, 'select * from chogs where token_id=?', [id]))!;
}
export const energyLeft = (r: Row, t = Date.now()) => r.energy_day === today(t) ? ENERGY - r.energy_used : ENERGY;
export async function getRel(a: number, b: number, x: Exec = dbc): Promise<Rel> {
  const [i, j] = a < b ? [a, b] : [b, a];
  const r = await q.get<any>(x, 'select bond, duels, wins_a from rels where a=? and b=?', [i, j]);
  return r ? { bond: Number(r.bond), duels: Number(r.duels), winsA: Number(r.wins_a) } : { bond: 0, duels: 0, winsA: 0 };
}
const putRel = (a: number, b: number, r: Rel, x: Exec) => { const [i, j] = a < b ? [a, b] : [b, a]; return q.run(x, 'insert or replace into rels values(?,?,?,?,?)', [i, j, r.bond, r.duels, r.winsA]); };
export async function relsOf(id: number, x: Exec = dbc) {
  return (await q.all<any>(x, 'select a,b,bond,duels,wins_a from rels where a=? or b=?', [id, id])).map(r => ({ other: Number(r.a) === id ? Number(r.b) : Number(r.a), r: { bond: Number(r.bond), duels: Number(r.duels), winsA: Number(r.wins_a) } as Rel }));
}
export const balanceOf = async (owner: string, x: Exec = dbc) => Number((await q.get<any>(x, 'select bal from balances where owner=?', [owner.toLowerCase()]))?.bal ?? 500);
const setBal = (owner: string, bal: number, x: Exec) => q.run(x, 'insert or replace into balances values(?,?)', [owner.toLowerCase(), bal]);
const nm = (id: number) => metaCache.get(id)?.name.replace('CHOG ', 'Chog ') ?? `Chog #${id}`;
let rnd = Math.random;
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
/** Core resolution. Server-only: rolls, rep, relationships, achievements. */
async function resolve(x: Exec, actor: number, target: number, action: Action, t: number, owner: string, signer: string | null, giftTx?: string): Promise<Event> {
  const A = metaCache.get(actor)!, B = metaCache.get(target)!;
  const sa = stats(A), sb = stats(B);
  const r = await getRel(actor, target, x); const ra = await chogRow(actor, x); await chogRow(target, x);
  const mult = 1 + Math.min(ra.streak_n, 7) * 0.05;
  let success = true, repA = 0, repB = 0, text = '';
  const a = nm(actor), b = nm(target);
  if (action === 'challenge') {
    const pa = sa.grit + sa.chaos + rnd() * 60, pb = sb.grit + sb.chaos + rnd() * 60;
    success = pa >= pb; r.duels++; if (success === (actor < target)) r.winsA++; r.bond -= 8;
    repA = Math.round((success ? 12 : -5) * mult); repB = success ? -5 : 10;
    text = success ? pick([`${a} challenged ${b} and won a brutal duel in the Monad mud.`, `${a} out-gritted ${b}. The crowd chants.`, `${a} flattened ${b} with pure chaos.`])
      : pick([`${a} challenged ${b}… and got humbled.`, `${b} reversed ${a}'s attack. Embarrassing.`]);
  } else if (action === 'befriend') {
    const gain = Math.round(10 + sa.charm / 6 + rnd() * 8); r.bond += gain; repA = Math.round(4 * mult); repB = 3;
    text = pick([`${a} shared snacks with ${b}. Bond +${gain}.`, `${a} and ${b} watched blocks finalize together. Bond +${gain}.`, `${a} vouched for ${b} in the Chog World Order. Bond +${gain}.`]);
  } else if (action === 'prank') {
    success = sa.chaos + rnd() * 50 > sb.charm + 20; r.bond -= success ? 12 : 4;
    repA = success ? Math.round(8 * mult) : -6; repB = success ? -3 : 2;
    text = success ? pick([`${a} replaced ${b}'s hat with a frog. Legendary prank.`, `${a} rugged ${b}'s lunch. Chaos +.`]) : `${a} tried to prank ${b} but slipped on their own banana.`;
  } else {
    r.bond += 25; repA = Math.round(10 * mult); repB = 6; if (!giftTx) await setBal(owner, (await balanceOf(owner, x)) - 25, x);
    text = `${a} gifted 25 $CHOG to ${b}${giftTx ? ' on-chain' : ''}. Generous Chog energy.`;
  }
  r.bond = Math.max(-100, Math.min(100, r.bond)); await putRel(actor, target, r, x);
  await q.run(x, 'update chogs set rep=rep+? where token_id=?', [repA, actor]);
  await q.run(x, 'update chogs set rep=rep+? where token_id=?', [repB, target]);
  const ev: Event = { id: randomUUID(), t, actor, target, action, success, text, repA, repB };
  await q.run(x, 'insert into events values(?,?,?,?,?,?,?,?,?,?)', [ev.id, t, actor, target, action, +success, text, repA, repB, signer]);
  if (giftTx) await q.run(x, 'insert into used_tx values(?,?,?)', [giftTx.toLowerCase(), ev.id, t]);
  await unlock(actor, x); await unlock(target, x);
  return ev;
}
async function unlock(id: number, x: Exec) {
  const row = await chogRow(id, x); const has = new Set<string>(JSON.parse(row.achievements));
  const c = await q.get<any>(x, `select sum(action='challenge' and success=1) w, sum(action='prank' and success=1) p, sum(action='gift') g from events where actor=?`, [id]);
  const cnt = (k: 'w' | 'p' | 'g') => Number(c?.[k] ?? 0);
  const labels = (await relsOf(id, x)).map(r => relLabel(r.r).label);
  const add = (n: string, c: boolean) => { if (c) has.add(n); };
  add('First Blood', cnt('w') > 0);
  add('Social Butterfly', labels.filter(l => l === 'Friend' || l === 'Sworn Ally').length >= 3);
  add('Rivalry Born', labels.includes('Rival') || labels.includes('Nemesis'));
  add('Nemesis Forged', labels.includes('Nemesis'));
  add('Chaos Agent', cnt('p') >= 3);
  add('Generous Soul', cnt('g') > 0);
  add('On a Streak', Number(row.streak_n) >= 3);
  add('Famous', Number(row.rep) >= 150);
  await q.run(x, 'update chogs set achievements=? where token_id=?', [JSON.stringify([...has]), id]);
}
/** Validated player action (auth handled by caller). */
export type ActOpts = { owner: string; signer: string | null; demoSession?: string; giftTx?: string };
export async function demoEnergyLeft(session: string, id: number, t = Date.now(), x: Exec = dbc) {
  const r = await q.get<any>(x, 'select day, used from demo_energy where session=? and token_id=?', [session, id]);
  return r && r.day === today(t) ? ENERGY - Number(r.used) : ENERGY;
}
export const act = (actor: number, target: number, action: Action, o: ActOpts): Promise<Event | string> => tx(async x => {
  if (actor === target) return 'A Chog cannot interact with itself.';
  if (!metaCache.has(actor) || !metaCache.has(target)) return 'Unknown Chog metadata.';
  const row = await chogRow(actor, x); const t = Date.now(); const d = today(t);
  const left = o.demoSession ? await demoEnergyLeft(o.demoSession, actor, t, x) : energyLeft(row, t);
  if (left <= 0) return 'Out of energy today. Come back tomorrow!';
  if (action === 'gift' && !o.giftTx && (await balanceOf(o.owner, x)) < 25) return 'Not enough $CHOG.';
  if (o.giftTx && await q.get(x, 'select 1 from used_tx where hash=?', [o.giftTx.toLowerCase()])) return 'Gift transaction already used.';
  const y = today(t - 864e5);
  const sn = Number(row.streak_n); const streak = row.streak_last === d ? sn : row.streak_last === y ? sn + 1 : 1;
  if (o.demoSession) {
    await q.run(x, 'insert into demo_energy values(?,?,?,1) on conflict(session, token_id) do update set used = case when day=excluded.day then used+1 else 1 end, day=excluded.day', [o.demoSession, actor, d]);
    await q.run(x, 'update chogs set streak_last=?, streak_n=? where token_id=?', [d, streak, actor]);
  } else await q.run(x, 'update chogs set energy_day=?, energy_used=?, streak_last=?, streak_n=? where token_id=?', [d, row.energy_day === d ? Number(row.energy_used) + 1 : 1, d, streak, actor]);
  return resolve(x, actor, target, action, t, o.owner, o.signer, o.giftTx);
});
export async function seedIfEmpty(force = false) {
  const n = Number((await q.get<any>(dbc, 'select count(*) n from events'))?.n ?? 0);
  if (n && !force) return;
  await tx(async x => {
    if (!force && Number((await q.get<any>(x, 'select count(*) n from events'))?.n ?? 0)) return; // another instance seeded
    for (const t of ['chogs', 'rels', 'events', 'balances', 'nonces', 'demo_energy', 'used_tx']) await q.run(x, `delete from ${t}`);
    await q.run(x, "insert or replace into meta values('season','1')");
    let s = 1969; rnd = () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9 | 0) >>> 0) / 4294967296;
    const ids = DEMO.map(c => c.tokenId); const acts: Action[] = ['challenge', 'challenge', 'befriend', 'befriend', 'prank', 'gift'];
    const now = Date.now();
    try {
      for (let i = 0; i < 60; i++) {
        const a = pick(ids); let b = pick(ids); if (a === b) b = ids[(ids.indexOf(a) + 1) % ids.length];
        const [pa, pb] = i % 5 === 0 ? [1, 42] : i % 7 === 0 ? [69, 420] : [a, b];
        const ac = i % 5 === 0 ? 'challenge' : i % 7 === 0 ? 'befriend' : pick(acts);
        await resolve(x, pa, pb, ac as Action, now - (60 - i) * 7.2e6, 'seed', null);
      }
      await q.run(x, "delete from balances where owner='seed'");
    } finally { rnd = Math.random; }
  });
}
// ---- On-chain $CHOG gift verification ----
import { CHOG_TOKEN, GIFT_AMOUNT } from '../shared/stats.js';
const erc20 = parseAbi(['function decimals() view returns (uint8)', 'event Transfer(address indexed from, address indexed to, uint256 value)']);
let decimals: number | undefined;
export async function chogDecimals() { return decimals ??= Number(await client.readContract({ address: CHOG_TOKEN, abi: erc20, functionName: 'decimals' })); }
/** Returns null if OK, else error string. */
export async function verifyGiftTx(hash: `0x${string}`, from: string, to: string): Promise<string | null> {
  if (await q.get(dbc, 'select 1 from used_tx where hash=?', [hash.toLowerCase()])) return 'Gift transaction already used.';
  let rc;
  for (let i = 0; i < 10 && !rc; i++) { try { rc = await client.getTransactionReceipt({ hash }); } catch { await new Promise(r => setTimeout(r, 1000)); } }
  if (!rc) return 'Transaction receipt not found on Monad.';
  if (rc.status !== 'success') return 'Gift transaction reverted.';
  const need = BigInt(GIFT_AMOUNT) * 10n ** BigInt(await chogDecimals());
  const logs = parseEventLogs({ abi: erc20, logs: rc.logs, eventName: 'Transfer' });
  const ok = logs.some(l => l.address.toLowerCase() === CHOG_TOKEN.toLowerCase() && l.args.from.toLowerCase() === from.toLowerCase() && l.args.to.toLowerCase() === to.toLowerCase() && l.args.value >= need);
  return ok ? null : `No ${GIFT_AMOUNT} $CHOG Transfer from ${from} to ${to} in that tx.`;
}
