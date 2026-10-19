import { randomUUID } from 'crypto';
import { db } from './db';
import { stats, relLabel, ENERGY, type Action, type Chog, type Event, type Rel } from '../shared/stats';
import demo from '../src/demoChogs.json' with { type: 'json' };
import { createPublicClient, http, parseAbi } from 'viem';
export const RPC = process.env.MONAD_RPC || 'https://rpc.monad.xyz';
export const CHOG_NFT = '0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763' as const;
export const client = createPublicClient({ transport: http(RPC) });
export const nftAbi = parseAbi(['function tokenURI(uint256) view returns (string)', 'function ownerOf(uint256) view returns (address)']);
const G = 'https://gateway.pinata.cloud/ipfs/';
export const DEMO: Chog[] = demo as Chog[];
const metaCache = new Map<number, Chog>(DEMO.map(c => [c.tokenId, c]));
for (const r of db.prepare('select json from metadata').all() as { json: string }[]) { const c = JSON.parse(r.json); metaCache.set(c.tokenId, c); }
export const getMeta = (id: number) => metaCache.get(id);
export async function loadMeta(id: number): Promise<Chog> {
  const hit = metaCache.get(id); if (hit) return hit;
  const uri = await client.readContract({ address: CHOG_NFT, abi: nftAbi, functionName: 'tokenURI', args: [BigInt(id)] });
  const m = await (await fetch(uri.replace('ipfs://', G))).json();
  const c: Chog = { tokenId: id, name: m.name, image: m.image.replace('ipfs://', G), attributes: m.attributes };
  metaCache.set(id, c); db.prepare('insert or replace into metadata values(?,?)').run(id, JSON.stringify(c)); return c;
}
const today = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
type Row = { token_id: number; rep: number; energy_day: string | null; energy_used: number; streak_last: string | null; streak_n: number; achievements: string };
export function chogRow(id: number): Row {
  db.prepare('insert or ignore into chogs(token_id) values(?)').run(id);
  return db.prepare('select * from chogs where token_id=?').get(id) as Row;
}
export const energyLeft = (r: Row, t = Date.now()) => r.energy_day === today(t) ? ENERGY - r.energy_used : ENERGY;
export function getRel(a: number, b: number): Rel {
  const [x, y] = a < b ? [a, b] : [b, a];
  const r = db.prepare('select bond, duels, wins_a winsA from rels where a=? and b=?').get(x, y) as Rel | undefined;
  return r || { bond: 0, duels: 0, winsA: 0 };
}
function putRel(a: number, b: number, r: Rel) { const [x, y] = a < b ? [a, b] : [b, a]; db.prepare('insert or replace into rels values(?,?,?,?,?)').run(x, y, r.bond, r.duels, r.winsA); }
export function relsOf(id: number) {
  return (db.prepare('select a,b,bond,duels,wins_a winsA from rels where a=? or b=?').all(id, id) as any[]).map(r => ({ other: r.a === id ? r.b : r.a, r: { bond: r.bond, duels: r.duels, winsA: r.winsA } as Rel }));
}
export const balanceOf = (owner: string) => (db.prepare('select bal from balances where owner=?').get(owner.toLowerCase()) as { bal: number } | undefined)?.bal ?? 500;
const setBal = (owner: string, bal: number) => db.prepare('insert or replace into balances values(?,?)').run(owner.toLowerCase(), bal);
const nm = (id: number) => metaCache.get(id)?.name.replace('CHOG ', 'Chog ') ?? `Chog #${id}`;
let rnd = Math.random;
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
/** Core resolution. Server-only: rolls, rep, relationships, achievements. */
function resolve(actor: number, target: number, action: Action, t: number, owner: string, signer: string | null): Event {
  const A = metaCache.get(actor)!, B = metaCache.get(target)!;
  const sa = stats(A), sb = stats(B);
  const r = getRel(actor, target); const ra = chogRow(actor), rb = chogRow(target);
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
    r.bond += 25; repA = Math.round(10 * mult); repB = 6; setBal(owner, balanceOf(owner) - 25);
    text = `${a} gifted 25 $CHOG to ${b}. Generous Chog energy.`;
  }
  r.bond = Math.max(-100, Math.min(100, r.bond)); putRel(actor, target, r);
  db.prepare('update chogs set rep=? where token_id=?').run(ra.rep + repA, actor);
  db.prepare('update chogs set rep=rep+? where token_id=?').run(repB, target);
  const ev: Event = { id: randomUUID(), t, actor, target, action, success, text, repA, repB };
  db.prepare('insert into events values(?,?,?,?,?,?,?,?,?,?)').run(ev.id, t, actor, target, action, +success, text, repA, repB, signer);
  unlock(actor); unlock(target);
  void rb; return ev;
}
function unlock(id: number) {
  const row = chogRow(id); const has = new Set<string>(JSON.parse(row.achievements));
  const cnt = (q: string) => (db.prepare(`select count(*) n from events where actor=? and ${q}`).get(id) as { n: number }).n;
  const labels = relsOf(id).map(x => relLabel(x.r).label);
  const add = (n: string, c: boolean) => { if (c) has.add(n); };
  add('First Blood', cnt("action='challenge' and success=1") > 0);
  add('Social Butterfly', labels.filter(l => l === 'Friend' || l === 'Sworn Ally').length >= 3);
  add('Rivalry Born', labels.includes('Rival') || labels.includes('Nemesis'));
  add('Nemesis Forged', labels.includes('Nemesis'));
  add('Chaos Agent', cnt("action='prank' and success=1") >= 3);
  add('Generous Soul', cnt("action='gift'") > 0);
  add('On a Streak', row.streak_n >= 3);
  add('Famous', row.rep >= 150);
  db.prepare('update chogs set achievements=? where token_id=?').run(JSON.stringify([...has]), id);
}
/** Validated player action (auth handled by caller). */
export const act = db.transaction((actor: number, target: number, action: Action, owner: string, signer: string | null): Event | string => {
  if (actor === target) return 'A Chog cannot interact with itself.';
  if (!metaCache.has(actor) || !metaCache.has(target)) return 'Unknown Chog metadata.';
  const row = chogRow(actor); const t = Date.now(); const d = today(t);
  if (energyLeft(row, t) <= 0) return 'Out of energy today. Come back tomorrow!';
  if (action === 'gift' && balanceOf(owner) < 25) return 'Not enough $CHOG.';
  const y = today(t - 864e5);
  const streak = row.streak_last === d ? row.streak_n : row.streak_last === y ? row.streak_n + 1 : 1;
  db.prepare('update chogs set energy_day=?, energy_used=?, streak_last=?, streak_n=? where token_id=?').run(d, row.energy_day === d ? row.energy_used + 1 : 1, d, streak, actor);
  return resolve(actor, target, action, t, owner, signer);
});
export function seedIfEmpty(force = false) {
  const n = (db.prepare('select count(*) n from events').get() as { n: number }).n;
  if (n && !force) return;
  db.exec('delete from chogs; delete from rels; delete from events; delete from balances; delete from nonces;');
  db.prepare("insert or replace into meta values('season','1')").run();
  let x = 1969; rnd = () => ((x = Math.imul(x ^ (x >>> 15), 2246822507) + 0x9e3779b9 | 0) >>> 0) / 4294967296;
  const ids = DEMO.map(c => c.tokenId); const acts: Action[] = ['challenge', 'challenge', 'befriend', 'befriend', 'prank', 'gift'];
  const now = Date.now();
  db.transaction(() => {
    for (let i = 0; i < 60; i++) {
      const a = pick(ids); let b = pick(ids); if (a === b) b = ids[(ids.indexOf(a) + 1) % ids.length];
      const [pa, pb] = i % 5 === 0 ? [1, 42] : i % 7 === 0 ? [69, 420] : [a, b];
      const ac = i % 5 === 0 ? 'challenge' : i % 7 === 0 ? 'befriend' : pick(acts);
      resolve(pa, pb, ac as Action, now - (60 - i) * 7.2e6, 'seed', null);
    }
    db.prepare("delete from balances where owner='seed'").run();
  })();
  rnd = Math.random;
}
