// Chog Daemons — in-memory world engine. Load state (few queries) → simulate → persist diff in one batch.
import { randomUUID } from 'crypto';
import { client as dbc, q, type Exec } from './db.js';
import { getMeta, DEMO } from './engine.js';
import {
  BEATS, CARDS, CURSES, TICK_MS, TICKS_PER_DAY, TILES, dayOf, hash, neighbors, outcomeOf, slotOf, stance, temperament, tileName, tileXY,
  type Card, type DEvent, type EventData, type Temperament,
} from '../shared/daemons.js';

export type Daemon = { id: number; rep: number; fort: number; curses: { name: string; until: number }[]; intel: { target: number; until: number }[]; lastOwner: string | null; inherited: any; awake: number };
export type Order = { token: number; day: string; card: Card; target: number; source: string; issuer: string; created: number; resolvedAt: number | null; eventId: string | null };
type Rel = { bond: number; duels: number; winsA: number };
export const RECENT = 'select * from events order by t desc limit ?';

export class World {
  daemons = new Map<number, Daemon>();
  tiles = new Map<number, number>(); // overrides: tile -> owner
  rels = new Map<string, Rel>();
  orders = new Map<string, Order>();
  bounties: { id: string; target: number; amount: number; poster: string; created: number }[] = [];
  events: DEvent[] = [];
  dirtyD = new Set<number>(); dirtyT = new Set<number>(); dirtyR = new Set<string>(); dirtyO = new Set<string>(); claimed: { id: string; by: number; t: number }[] = []; credits = new Map<string, number>();
  rnd: () => number = Math.random;
  tempCache = new Map<number, Temperament>();

  static async load(x: Exec = dbc, now = Date.now()) {
    const w = new World();
    const days = [dayOf(now), dayOf(now - 864e5), dayOf(now - 2 * 864e5)];
    const [ds, ts, rs, os, bs] = await Promise.all([
      q.all(x, 'select * from daemons'), q.all(x, 'select * from tiles'), q.all(x, 'select * from rels'),
      q.all(x, 'select * from orders where day in (?,?,?)', days), q.all(x, 'select * from bounties where claimed_by is null'),
    ]);
    for (const r of ds) w.daemons.set(Number(r.token_id), { id: Number(r.token_id), rep: Number(r.rep), fort: Number(r.fort), curses: JSON.parse(String(r.curses || '[]')), intel: JSON.parse(String(r.intel || '[]')), lastOwner: (r.last_owner as string) ?? null, inherited: r.inherited ? JSON.parse(String(r.inherited)) : null, awake: Number(r.awake) });
    for (const r of ts) w.tiles.set(Number(r.tile_id), Number(r.owner));
    for (const r of rs) w.rels.set(`${r.a}-${r.b}`, { bond: Number(r.bond), duels: Number(r.duels), winsA: Number(r.wins_a) });
    for (const r of os) w.orders.set(`${r.token_id}|${r.day}`, { token: Number(r.token_id), day: String(r.day), card: r.card as Card, target: Number(r.target), source: String(r.source), issuer: String(r.issuer), created: Number(r.created), resolvedAt: r.resolved_at == null ? null : Number(r.resolved_at), eventId: (r.event_id as string) ?? null });
    w.bounties = bs.map(b => ({ id: String(b.id), target: Number(b.target), amount: Number(b.amount), poster: String(b.poster), created: Number(b.created) }));
    return w;
  }
  stmts() {
    const s: { sql: string; args: any[] }[] = [];
    for (const id of this.dirtyD) { const d = this.daemons.get(id)!; s.push({ sql: 'insert or replace into daemons(token_id, rep, fort, curses, intel, last_owner, inherited, awake) values(?,?,?,?,?,?,?,?)', args: [id, d.rep, d.fort, JSON.stringify(d.curses), JSON.stringify(d.intel), d.lastOwner, d.inherited ? JSON.stringify(d.inherited) : null, d.awake] }); }
    for (const t of this.dirtyT) { const o = this.tiles.get(t); s.push(o == null || o === t ? { sql: 'delete from tiles where tile_id=?', args: [t] } : { sql: 'insert or replace into tiles(tile_id, owner) values(?,?)', args: [t, o] }); }
    for (const k of this.dirtyR) { const r = this.rels.get(k)!; const [a, b] = k.split('-').map(Number); s.push({ sql: 'insert or replace into rels(a,b,bond,duels,wins_a) values(?,?,?,?,?)', args: [a, b, r.bond, r.duels, r.winsA] }); }
    for (const k of this.dirtyO) { const o = this.orders.get(k)!; s.push({ sql: 'insert or replace into orders(token_id, day, card, target, source, issuer, created, resolved_at, event_id) values(?,?,?,?,?,?,?,?,?)', args: [o.token, o.day, o.card, o.target, o.source, o.issuer, o.created, o.resolvedAt, o.eventId] }); }
    for (const e of this.events) s.push({ sql: 'insert into events(id,t,actor,target,action,success,text,rep_a,rep_b,signer,data) values(?,?,?,?,?,?,?,?,?,?,?)', args: [e.id, e.t, e.actor, e.target, e.action, +e.success, e.text, e.repA, e.repB, null, JSON.stringify(e.data ?? {})] });
    for (const c of this.claimed) s.push({ sql: 'update bounties set claimed_by=?, claimed_at=? where id=?', args: [c.by, c.t, c.id] });
    for (const [owner, delta] of this.credits) s.push({ sql: 'insert into balances(owner, bal) values(?, 500 + ?) on conflict(owner) do update set bal = bal + ?', args: [owner, delta, delta] });
    return s;
  }
  async persist() { const s = this.stmts(); for (let i = 0; i < s.length; i += 400) await dbc.batch(s.slice(i, i + 400), 'write'); }

  // ---------- helpers ----------
  temp(id: number) { let t = this.tempCache.get(id); if (!t) { const m = getMeta(id); t = m ? temperament(m) : { aggression: 50, loyalty: 50, mischief: 50, greed: 50 }; this.tempCache.set(id, t); } return t; }
  owner(t: number) { return this.tiles.get(t) ?? t; }
  setOwner(t: number, o: number) { this.tiles.set(t, o); this.dirtyT.add(t); }
  isHome(t: number) { return this.daemons.get(t)?.awake === 1; }
  tilesOf(o: number) { const r: number[] = []; for (let t = 1; t <= TILES; t++) if (this.owner(t) === o) r.push(t); return r; }
  territory() { const m = new Map<number, number>(); for (let t = 1; t <= TILES; t++) { const o = this.owner(t); m.set(o, (m.get(o) ?? 0) + 1); } return m; }
  rel(a: number, b: number) { const k = a < b ? `${a}-${b}` : `${b}-${a}`; return this.rels.get(k) ?? { bond: 0, duels: 0, winsA: 0 }; }
  setRel(a: number, b: number, f: (r: Rel) => void) { const k = a < b ? `${a}-${b}` : `${b}-${a}`; const r = { ...this.rel(a, b) }; f(r); r.bond = Math.max(-100, Math.min(100, Math.round(r.bond))); this.rels.set(k, r); this.dirtyR.add(k); }
  d(id: number) { let d = this.daemons.get(id); if (!d) { d = { id, rep: 100, fort: 0, curses: [], intel: [], lastOwner: null, inherited: null, awake: 1 }; this.daemons.set(id, d); this.dirtyD.add(id); } return d; }
  touch(id: number) { this.dirtyD.add(id); return this.d(id); }
  awake() { return [...this.daemons.values()].filter(d => d.awake === 1).map(d => d.id); }
  pick<T>(a: T[]) { return a[Math.floor(this.rnd() * a.length)]; }
  orderOf(id: number, day: string) { return this.orders.get(`${id}|${day}`); }

  /** Wake a daemon: it reclaims its home tile (sanctuary). */
  wake(id: number) { const d = this.touch(id); d.awake = 1; if (this.owner(id) !== id) this.setOwner(id, id); return d; }

  /** Transfer up to n non-home tiles from `from` to `to`, preferring tiles bordering `to`'s land. */
  takeTiles(from: number, to: number, n: number) {
    if (n <= 0) return [] as number[];
    const pool = this.tilesOf(from).filter(t => !(t === from && this.isHome(t)));
    const border = pool.filter(t => neighbors(t).some(nb => this.owner(nb) === to));
    const taken: number[] = [];
    const src = border.length ? border : pool;
    while (taken.length < n && src.length) { const i = Math.floor(this.rnd() * src.length); taken.push(src.splice(i, 1)[0]); }
    for (const t of taken) this.setOwner(t, to);
    return taken;
  }
  neighborsOf(id: number) { const s = new Set<number>(); for (const t of this.tilesOf(id)) for (const nb of neighbors(t)) { const o = this.owner(nb); if (o !== id && this.daemons.get(o)?.awake) s.add(o); } return [...s]; }

  /** Personality-driven choice of card + target for idle daemons. */
  autoOrder(id: number): { card: Card; target: number } {
    const t = this.temp(id); const others = this.awake().filter(o => o !== id);
    const allies = others.filter(o => this.rel(id, o).bond >= 20).sort((a, b) => this.rel(id, b).bond - this.rel(id, a).bond);
    const foes = others.filter(o => this.rel(id, o).bond <= -15).sort((a, b) => this.rel(id, a).bond - this.rel(id, b).bond);
    const nbs = this.neighborsOf(id);
    const w: [Card, number][] = [['raid', t.aggression + (foes.length ? 20 : 0)], ['fortify', t.loyalty * 0.7 + (this.d(id).fort < 1 ? 15 : 0)], ['ally', t.loyalty * 0.8], ['betray', allies.length ? t.greed * 0.7 : 0], ['prank', t.mischief], ['scout', t.mischief * 0.5]];
    const sum = w.reduce((a, [, v]) => a + v, 0); let r = this.rnd() * sum; let card: Card = 'raid';
    for (const [c, v] of w) { if ((r -= v) <= 0) { card = c; break; } }
    let target = 0;
    if (card === 'betray') target = allies[0];
    else if (card === 'ally') target = (this.rnd() < 0.5 && allies.length ? this.pick(allies) : this.pick(nbs.length ? nbs : others));
    else if (card !== 'fortify') target = foes.length && this.rnd() < 0.55 ? foes[0] : this.pick(nbs.length ? nbs : others);
    return { card, target: target || 0 };
  }

  /** Resolve one daemon's order at time t. Returns the event. */
  resolve(o: Order, t: number): DEvent {
    const A = o.token; const a = this.touch(A); const ta = this.temp(A);
    a.curses = a.curses.filter(c => c.until > t); a.intel = a.intel.filter(i => i.until > t);
    let card = o.card; let B = o.target;
    if (CARD_TARGET(card) && (!B || B === A || !this.daemons.get(B)?.awake)) { const auto = this.autoOrder(A); B = auto.target; if (!B) card = 'fortify'; }
    if (card === 'betray' && this.rel(A, B).bond < 20) card = 'raid'; // no trust to betray → it's just a raid
    const data: EventData = { aCard: card, source: o.source };
    const ev = (success: boolean, repA: number, repB: number, text: string): DEvent => {
      a.rep += repA; if (B) this.touch(B).rep += repB;
      const e: DEvent = { id: randomUUID(), t, actor: A, target: B || A, action: card, success, text, repA, repB, data };
      this.events.push(e); o.resolvedAt = t; o.eventId = e.id; o.card = card; o.target = B; this.dirtyO.add(`${o.token}|${o.day}`); return e;
    };
    if (card === 'fortify') { const walls = ta.loyalty >= 65 ? 2 : 1; a.fort = Math.min(6, a.fort + walls); data.walls = walls; return ev(true, 2, 0, `#${A} fortified (+${walls} walls).`); }
    const b = this.touch(B); const tb = this.temp(B);
    const bOrder = this.orderOf(B, o.day); const bCard: Card = bOrder?.card ?? stance(tb); data.bCard = bCard;
    let out = outcomeOf(card, bCard); data.outcome = out;
    const intel = a.intel.find(i => i.target === B);
    if (out === 'neutral') {
      const stat = (tt: Temperament, c: Card) => c === 'raid' ? tt.aggression : c === 'fortify' || c === 'ally' ? tt.loyalty : c === 'prank' || c === 'scout' ? tt.mischief : tt.greed;
      const sa = stat(ta, card) + this.rnd() * 40 + (intel ? 25 : 0) + (card === 'raid' && ta.aggression >= 70 ? 15 : 0), sb = stat(tb, bCard) + this.rnd() * 40;
      out = sa >= sb ? 'win' : 'lose';
    }
    const win = out === 'win';
    this.setRel(A, B, r => { r.duels += card === 'raid' || card === 'betray' ? 1 : 0; if (win === (A < B)) r.winsA++; });
    const claim = () => { const bo = this.bounties.find(x => x.target === B); if (!bo) return; this.bounties = this.bounties.filter(x => x !== bo); this.claimed.push({ id: bo.id, by: A, t }); data.bounty = bo.amount; const o2 = this.orderOf(A, o.day); const who = o2?.issuer && o2.source !== 'auto' ? o2.issuer : null; if (who) this.credits.set(who, (this.credits.get(who) ?? 0) + bo.amount); };
    switch (card) {
      case 'raid': {
        this.setRel(A, B, r => r.bond -= 12);
        if (win) {
          let n = 1 + (ta.greed >= 65 ? 1 : 0) + (intel ? 1 : 0);
          if (b.fort > 0) { b.fort--; n--; data.wallsBroken = 1; }
          const got = this.takeTiles(B, A, n); data.tiles = got.length; data.tileNames = got.map(tileName); claim();
          return ev(true, 8 + got.length * 3, -4, `#${A} raided #${B} and seized ${got.length} tile(s).`);
        }
        const back = this.takeTiles(A, B, bCard === 'fortify' ? 0 : 1); data.tiles = back.length; data.tileNames = back.map(tileName);
        return ev(false, -5, 6, `#${A} raided #${B} and was repelled.`);
      }
      case 'betray': {
        if (win) {
          const got = this.takeTiles(B, A, 2 + (ta.greed >= 70 ? 1 : 0) - (ta.loyalty >= 75 ? 1 : 0)); data.tiles = got.length; data.tileNames = got.map(tileName);
          this.setRel(A, B, r => r.bond = -80); claim();
          return ev(true, 12, -8, `#${A} betrayed #${B} and grabbed ${got.length} tile(s).`);
        }
        this.setRel(A, B, r => r.bond = -50); return ev(false, -10, 5, `#${A} tried to betray #${B} and was exposed.`);
      }
      case 'ally': {
        const pact = bCard === 'ally'; data.pact = pact;
        const gain = (win || pact ? 15 : 5) * (ta.loyalty >= 70 ? 2 : 1) + (pact ? 25 : 0);
        this.setRel(A, B, r => r.bond += gain);
        return ev(win || pact, pact ? 8 : 3, pact ? 8 : 2, pact ? `#${A} and #${B} swore a pact.` : `#${A} offered #${B} an alliance.`);
      }
      case 'prank': {
        this.setRel(A, B, r => r.bond -= 8);
        if (win) {
          const curse = this.pick(CURSES); data.curse = curse; b.curses.push({ name: curse, until: t + 3 * 864e5 }); if (b.fort > 0) b.fort--;
          return ev(true, 6, ta.mischief >= 70 ? -5 : -2, `#${A} pranked #${B}: ${curse}.`);
        }
        return ev(false, -4, 3, `#${A}'s prank on #${B} backfired.`);
      }
      case 'scout': {
        if (win) { a.intel.push({ target: B, until: t + (ta.mischief >= 60 ? 2 : 1) * 864e5 }); return ev(true, 3, 0, `#${A} scouted #${B}.`); }
        this.setRel(A, B, r => r.bond -= 5); return ev(false, -2, 2, `#${A}'s scouts were caught by #${B}.`);
      }
    }
    return ev(false, 0, 0, '');
  }

  /** One world tick at time T: resolve sealed orders, and idle daemons whose slot it is act on personality. */
  tick(T: number) {
    const day = dayOf(T), slot = slotOf(T); const out: DEvent[] = [];
    for (const o of [...this.orders.values()]) if (o.resolvedAt == null && o.created <= T && o.day === day) out.push(this.resolve(o, T));
    for (const id of this.awake()) {
      if (this.orderOf(id, day)) continue;
      if (hash(`slot${id}${day}`) % TICKS_PER_DAY !== slot) continue;
      const { card, target } = this.autoOrder(id);
      const o: Order = { token: id, day, card, target, source: 'auto', issuer: 'daemon', created: T, resolvedAt: null, eventId: null };
      this.orders.set(`${id}|${day}`, o); out.push(this.resolve(o, T));
    }
    return out;
  }

  /** Seed: wake the daemon pool, split the wilderness among them (Voronoi), then truly simulate `days` of history. */
  seed(days: number, now: number) {
    let s = 1969; this.rnd = () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9 | 0) >>> 0) / 4294967296;
    const ids = DEMO.map(c => c.tokenId);
    for (const id of ids) this.wake(id);
    const pos = ids.map(id => ({ id, ...tileXY(id) }));
    for (let t = 1; t <= TILES; t++) { if (ids.includes(t)) continue; const { x, y } = tileXY(t); let best = pos[0], bd = 1e9; for (const p of pos) { const dd = Math.abs(p.x - x) + Math.abs(p.y - y) + (hash('j' + t + p.id) % 3) * 0.3; if (dd < bd) { bd = dd; best = p; } } this.setOwner(t, best.id); }
    const start = Math.floor((now - days * 864e5) / TICK_MS) * TICK_MS;
    for (let T = start; T <= now; T += TICK_MS) this.tick(T);
    this.rnd = Math.random;
    return Math.floor(now / TICK_MS) * TICK_MS;
  }
}
const CARD_TARGET = (c: Card) => c !== 'fortify';
export { CARDS, BEATS };
