// Chog Daemons — shared rules (used by server engine and UI).
import type { Chog } from './stats.js';
export const COLS = 47, ROWS = 42, TILES = 1969;
export const TICK_MS = 30 * 60 * 1000; // world tick every 30 minutes
export const TICKS_PER_DAY = 48;
export const tileXY = (t: number) => ({ x: (t - 1) % COLS, y: Math.floor((t - 1) / COLS) });
export const tileAt = (x: number, y: number) => (x < 0 || y < 0 || x >= COLS || y >= ROWS ? 0 : y * COLS + x + 1 <= TILES ? y * COLS + x + 1 : 0);
export const neighbors = (t: number) => { const { x, y } = tileXY(t); return [tileAt(x + 1, y), tileAt(x - 1, y), tileAt(x, y + 1), tileAt(x, y - 1)].filter(Boolean); };
export function hash(s: string) { let x = 2166136261; for (const ch of s) x = Math.imul(x ^ ch.charCodeAt(0), 16777619); return x >>> 0; }
const BIOMES = ['Swamp', 'Bog', 'Mudflat', 'Crystal Cave', 'Moss Hollow', 'Neon Grove', 'Purple Dunes', 'Frog Pond', 'Block Quarry', 'Gas Marsh', 'Mempool Reef', 'Validator Peak'];
const ADJ = ['Ooze', 'Whispers', 'Mischief', 'Gloom', 'Laser', 'Snacks', 'Chaos', 'Finality', 'Grit', 'Glitter'];
export const tileName = (t: number) => `${BIOMES[hash('b' + t) % BIOMES.length]} of ${ADJ[hash('a' + t) % ADJ.length]}`;
export const ownerColor = (owner: number) => `hsl(${hash('c' + owner) % 360} 65% ${48 + (hash('l' + owner) % 14)}%)`;

export type Card = 'raid' | 'fortify' | 'ally' | 'betray' | 'prank' | 'scout';
export const CARDS: Card[] = ['raid', 'fortify', 'ally', 'betray', 'prank', 'scout'];
export const CARD_INFO: Record<Card, { icon: string; name: string; blurb: string; target: boolean }> = {
  raid: { icon: '⚔️', name: 'Raid', blurb: 'Attack a Chog and seize its land.', target: true },
  fortify: { icon: '🛡️', name: 'Fortify', blurb: 'Raise walls. Absorbs raids, punishes pranks.', target: false },
  ally: { icon: '🤝', name: 'Ally', blurb: 'Offer a pact. Two allies grow stronger together.', target: true },
  betray: { icon: '🗡️', name: 'Betray', blurb: 'Stab a trusted ally in the back. Huge land grab.', target: true },
  prank: { icon: '😈', name: 'Prank', blurb: 'Curse a Chog and steal its walls.', target: true },
  scout: { icon: '🔭', name: 'Scout', blurb: 'Spy on a Chog; your next raid on it hits harder.', target: true },
};
/** Rock-paper-scissors: each card beats exactly two, loses to two, is neutral with one. */
export const BEATS: Record<Card, Card[]> = {
  raid: ['ally', 'scout'], fortify: ['raid', 'prank'], ally: ['prank', 'scout'],
  betray: ['ally', 'fortify'], prank: ['raid', 'betray'], scout: ['betray', 'fortify'],
};
export const WHY: Record<string, string> = {
  'raid>ally': 'caught them with the gates open', 'raid>scout': 'overran the spies', 'fortify>raid': 'the walls held',
  'fortify>prank': 'nothing to prank behind stone walls', 'ally>prank': 'friends laughed the prank off', 'ally>scout': 'allies share no secrets with spies',
  'betray>ally': 'a knife from a friend', 'betray>fortify': 'opened the gates from inside', 'prank>raid': 'tripped the raiders with banana peels',
  'prank>betray': 'exposed the traitor in public', 'scout>betray': 'saw the betrayal coming', 'scout>fortify': 'found the crack in the wall',
};
export const outcomeOf = (a: Card, b: Card): 'win' | 'lose' | 'neutral' => BEATS[a].includes(b) ? 'win' : BEATS[b].includes(a) ? 'lose' : 'neutral';

export type Temperament = { aggression: number; loyalty: number; mischief: number; greed: number };
export function temperament(c: Chog): Temperament {
  const a = Object.fromEntries(c.attributes.map(t => [t.trait_type, String(t.value)]));
  const b = (k: string) => 25 + (hash(k) % 61);
  const tier: Record<string, number> = { Common: 0, Uncommon: 4, Rare: 8, Epic: 12, Legendary: 16 };
  const tb = tier[a.Tier] ?? 2;
  return {
    aggression: Math.min(99, b('agg' + a.Eyes + a.Body) + (/laser|angry|red/i.test(a.Eyes + a.Mouth) ? 12 : 0) + tb),
    loyalty: Math.min(99, b('loy' + a.Skin + a.Background) + (/smile|happy/i.test(a.Mouth) ? 10 : 0)),
    mischief: Math.min(99, b('mis' + a.Mouth + a.Head) + (/grin|tongue|grit/i.test(a.Mouth) ? 12 : 0) + tb / 2),
    greed: Math.min(99, b('gre' + a.Body + a.Accessory) + (/gold|btc|bitcoin|coin/i.test(JSON.stringify(a)) ? 12 : 0)),
  };
}
/** Default card a daemon falls back to when nobody gives it an order. */
export function stance(t: Temperament): Card {
  const top = (Object.entries(t) as [keyof Temperament, number][]).sort((x, y) => y[1] - x[1])[0][0];
  return ({ aggression: 'raid', loyalty: 'fortify', mischief: 'prank', greed: 'betray' } as const)[top];
}
/** How traits modify a card for this Chog (shown on the order card). */
export function perks(t: Temperament): Record<Card, string> {
  return {
    raid: t.greed >= 65 ? 'Greedy: steals +1 extra tile on a win' : t.aggression >= 70 ? 'Brutal: wins most neutral raids' : 'Standard raid',
    fortify: t.loyalty >= 65 ? 'Stalwart: +2 walls instead of +1' : 'Adds +1 wall',
    ally: t.loyalty >= 70 ? 'Devoted: bonds grow twice as fast' : 'Standard pact',
    betray: t.greed >= 70 ? 'Ruthless: steals +1 extra tile' : t.loyalty >= 75 ? 'Hesitant: loyal Chogs betray badly' : 'Standard betrayal',
    prank: t.mischief >= 70 ? 'Menace: curse also drains 5 rep' : 'Curses the target',
    scout: t.mischief >= 60 ? 'Sneaky: intel lasts 2 days' : 'Intel lasts 1 day',
  };
}
export const CURSES = ['Curse of Soggy Socks', 'Hex of the Slow Block', 'Curse of Endless Mempool', 'Frog Hiccups', 'Rugged Luck', 'Hex of Lost Snacks'];
export type DEvent = { id: string; t: number; actor: number; target: number; action: string; success: boolean; text: string; repA: number; repB: number; data?: EventData };
export type EventData = { wallsBroken?: number; outcome?: 'win' | 'lose' | 'neutral'; aCard?: Card; bCard?: Card; tiles?: number; tileNames?: string[]; curse?: string; bounty?: number; source?: string; pact?: boolean; walls?: number };
const nm = (id: number) => `#${id}`;
/** First-person diary line from a real event, from the perspective of `me`. */
export function diaryLine(e: DEvent, me: number): string {
  const base = diaryCore(e, me); if (!base) return base;
  const extra = (e.data?.bounty && e.actor === me ? ` Collected a ${e.data.bounty} $CHOG bounty.` : '') + (e.data?.wallsBroken ? (e.actor === me ? ' Smashed one of their walls.' : ' They smashed one of my walls.') : '');
  return base + extra;
}
function diaryCore(e: DEvent, me: number): string {
  const d = e.data || {}; const actor = e.actor === me; const other = nm(actor ? e.target : e.actor);
  const land = d.tiles ? `${d.tiles} tile${d.tiles > 1 ? 's' : ''}${d.tileNames?.[0] ? ` (incl. the ${d.tileNames[0]})` : ''}` : '';
  const why = d.aCard && d.bCard ? WHY[`${e.success ? d.aCard : d.bCard}>${e.success ? d.bCard : d.aCard}`] : undefined;
  const W = why ? ` — ${why}.` : '.';
  switch (e.action) {
    case 'fortify': return `I spent the night stacking walls. +${d.walls ?? 1} wall${(d.walls ?? 1) > 1 ? 's' : ''}. Let them come.`;
    case 'raid': return actor
      ? (e.success ? `I raided ${other} and took ${land || (d.wallsBroken ? 'down a wall' : 'their pride (and some rep)')}${W}` : `I raided ${other} and got thrown back${W} ${d.tiles ? `I lost ${land}.` : ''}`)
      : (e.success ? `${other} raided me in the dark and took ${land || 'my snacks'}${W} I won't forget.` : `${other} tried to raid me. ${why ? why[0].toUpperCase() + why.slice(1) : 'I held'}. ${d.tiles ? `I even took ${land} back.` : ''}`);
    case 'ally': return d.pact ? `${other} and I swore a pact under the purple moon. Allies now.` : actor ? (e.success ? `I offered ${other} friendship. They accepted, sort of.` : `I offered ${other} an alliance. Cold shoulder${W}`) : `${other} wants to be friends with me. ${e.success ? 'Fine.' : 'Suspicious.'}`;
    case 'betray': return actor
      ? (e.success ? `I betrayed ${other}. Took ${land || 'everything I could'}. Sorry, not sorry.` : `I tried to betray ${other}${W} Now they know.`)
      : (e.success ? `${other} BETRAYED me. Took ${land || 'my trust'}. ${other} is my nemesis now.` : `${other} tried to stab me in the back${W} Noted.`);
    case 'prank': return actor
      ? (e.success ? `I pranked ${other}: ${d.curse ?? 'cursed'}. Hehe.` : `My prank on ${other} backfired${W}`)
      : (e.success ? `Woke up with ${d.curse ?? 'a curse'}. ${other} did this.` : `${other} tried to prank me and slipped${W}`);
    case 'scout': return actor ? (e.success ? `Scouted ${other}'s land. I know their weak spots now.` : `My scouts got caught by ${other}${W}`) : (e.success ? `Something was watching me from the reeds. ${other}?` : `Caught ${other}'s spy in my bushes.`);
    case 'adopt': return actor ? `A new keeper found me. Let's see what they're made of.` : '';
    default: return e.text;
  }
}
export const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);
export const slotOf = (t: number) => Math.floor((t % 86400000) / TICK_MS);
export const orderMessage = (p: { tokenId: number; card: string; target: number; day: string; nonce: string; issuedAt: number; tx?: string }) =>
  `Chog Daemons order\nChog: ${p.tokenId}\nCard: ${p.card}\nTarget: ${p.target}\nDay: ${p.day}\nNonce: ${p.nonce}\nIssued: ${p.issuedAt}` + (p.tx ? `\nTx: ${p.tx.toLowerCase()}` : '');
