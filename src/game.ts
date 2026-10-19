import { getChog, stats, DEMO, type Chog } from './chogs';
export type Action = 'challenge' | 'befriend' | 'prank' | 'gift';
export type Event = { id: string; t: number; actor: number; target: number; action: Action; success: boolean; text: string; repA: number; repB: number };
export type Rel = { bond: number; duels: number; winsA: number }; // key "a-b" with a<b; winsA = wins of the lower id
export type State = { rep: Record<number, number>; rels: Record<string, Rel>; events: Event[]; energy: Record<number, { day: string; used: number }>; streak: Record<number, { last: string; n: number }>; chogBalance: number; achievements: Record<number, string[]>; season: number };
const KEY = 'cc.state.v1';
export const ENERGY = 3;
const today = () => new Date().toISOString().slice(0, 10);
const empty = (): State => ({ rep: {}, rels: {}, events: [], energy: {}, streak: {}, chogBalance: 500, achievements: {}, season: 1 });
let st: State;
const subs = new Set<() => void>();
function load(): State { try { const s = localStorage.getItem(KEY); if (s) return JSON.parse(s); } catch {} const s = empty(); seedWorld(s); return s; }
function save() { localStorage.setItem(KEY, JSON.stringify(st)); subs.forEach(f => f()); }
export const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const getState = () => st;
export function resetWorld() { st = empty(); seedWorld(st); save(); }
export const relKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
export const rel = (s: State, a: number, b: number): Rel => s.rels[relKey(a, b)] || { bond: 0, duels: 0, winsA: 0 };
export function relLabel(r: Rel) {
  if (r.duels >= 5 && r.bond < 0) return { label: 'Nemesis', cls: 'bad' };
  if (r.duels >= 3 && r.bond < 20) return { label: 'Rival', cls: 'warn' };
  if (r.bond >= 70) return { label: 'Sworn Ally', cls: 'ok' };
  if (r.bond >= 30) return { label: 'Friend', cls: 'ok' };
  if (r.bond <= -30) return { label: 'Enemy', cls: 'bad' };
  return { label: 'Acquaintance', cls: '' };
}
export const energyLeft = (id: number) => { const e = st.energy[id]; return e && e.day === today() ? ENERGY - e.used : ENERGY; };
export const repOf = (s: State, id: number) => s.rep[id] ?? 100;
export function title(rep: number) { return rep >= 220 ? 'Chog Legend' : rep >= 170 ? 'Warlord' : rep >= 130 ? 'Troublemaker' : rep >= 90 ? 'Citizen' : 'Outcast'; }
const nm = (id: number) => getChog(id)?.name.replace('CHOG ', 'Chog ') ?? `Chog #${id}`;
let rnd = Math.random;
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
function apply(s: State, actor: number, target: number, action: Action, t = Date.now()): Event {
  const A = getChog(actor) as Chog, B = getChog(target) as Chog;
  const sa = stats(A), sb = stats(B);
  const k = relKey(actor, target); const r = { ...rel(s, actor, target) };
  const streak = s.streak[actor]?.n ?? 0; const mult = 1 + Math.min(streak, 7) * 0.05;
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
    r.bond += 25; repA = Math.round(10 * mult); repB = 6; s.chogBalance -= 25;
    text = `${a} gifted 25 $CHOG to ${b}. Generous Chog energy.`;
  }
  r.bond = Math.max(-100, Math.min(100, r.bond)); s.rels[k] = r;
  s.rep[actor] = repOf(s, actor) + repA; s.rep[target] = repOf(s, target) + repB;
  const ev: Event = { id: Math.random().toString(36).slice(2), t, actor, target, action, success, text, repA, repB };
  s.events.unshift(ev); s.events = s.events.slice(0, 500);
  unlock(s, actor); unlock(s, target);
  return ev;
}
export const ACHIEVEMENTS: Record<string, string> = {
  'First Blood': 'Win your first duel', 'Social Butterfly': '3+ friends', 'Rivalry Born': 'Gain a rival', 'Nemesis Forged': 'Gain a nemesis',
  'Chaos Agent': '3 successful pranks', 'Generous Soul': 'Gift $CHOG', 'On a Streak': '3-day streak', 'Famous': 'Reach 150 rep',
};
function unlock(s: State, id: number) {
  const mine = s.events.filter(e => e.actor === id);
  const others = Object.entries(s.rels).filter(([k]) => k.split('-').map(Number).includes(id)).map(([, r]) => relLabel(r).label);
  const has = new Set(s.achievements[id] || []);
  const add = (n: string, c: boolean) => c && has.add(n);
  add('First Blood', mine.some(e => e.action === 'challenge' && e.success));
  add('Social Butterfly', others.filter(l => l === 'Friend' || l === 'Sworn Ally').length >= 3);
  add('Rivalry Born', others.includes('Rival') || others.includes('Nemesis'));
  add('Nemesis Forged', others.includes('Nemesis'));
  add('Chaos Agent', mine.filter(e => e.action === 'prank' && e.success).length >= 3);
  add('Generous Soul', mine.some(e => e.action === 'gift'));
  add('On a Streak', (s.streak[id]?.n ?? 0) >= 3);
  add('Famous', repOf(s, id) >= 150);
  s.achievements[id] = [...has];
}
export function act(actor: number, target: number, action: Action): Event | string {
  if (actor === target) return 'A Chog cannot interact with itself.';
  if (energyLeft(actor) <= 0) return 'Out of energy today. Come back tomorrow!';
  if (action === 'gift' && st.chogBalance < 25) return 'Not enough $CHOG.';
  const d = today(); const e = st.energy[actor];
  st.energy[actor] = { day: d, used: e && e.day === d ? e.used + 1 : 1 };
  const sk = st.streak[actor]; const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  if (!sk || sk.last !== d) st.streak[actor] = { last: d, n: sk && sk.last === y ? sk.n + 1 : 1 };
  const ev = apply(st, actor, target, action); save(); return ev;
}
// Simulated world history so the demo starts alive (deterministic seed)
function seedWorld(s: State) {
  let x = 1969; rnd = () => ((x = Math.imul(x ^ (x >>> 15), 2246822507) + 0x9e3779b9 | 0) >>> 0) / 4294967296;
  const ids = DEMO.map(c => c.tokenId); const acts: Action[] = ['challenge', 'challenge', 'befriend', 'befriend', 'prank', 'gift'];
  const now = Date.now();
  for (let i = 0; i < 60; i++) {
    const a = pick(ids); let b = pick(ids); if (a === b) b = ids[(ids.indexOf(a) + 1) % ids.length];
    // a few pairs become storied rivals/friends
    const [pa, pb] = i % 5 === 0 ? [1, 42] : i % 7 === 0 ? [69, 420] : [a, b];
    const ac = i % 5 === 0 ? 'challenge' : i % 7 === 0 ? 'befriend' : pick(acts);
    apply(s, pa, pb, ac, now - (60 - i) * 3.6e6 * 2);
  }
  s.chogBalance = 500; rnd = Math.random;
}
st = load();
