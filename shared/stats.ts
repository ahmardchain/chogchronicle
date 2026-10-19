export type Attr = { trait_type: string; value: string };
export type Chog = { tokenId: number; name: string; image: string; ipfsImage?: string; attributes: Attr[] };
function h(s: string) { let x = 2166136261; for (const ch of s) x = Math.imul(x ^ ch.charCodeAt(0), 16777619); return (x >>> 0); }
export function stats(c: Chog) {
  const a = Object.fromEntries(c.attributes.map(t => [t.trait_type, String(t.value)]));
  const tierBonus: Record<string, number> = { Common: 0, Uncommon: 4, Rare: 8, Epic: 12, Legendary: 16 };
  const tb = tierBonus[a.Tier] ?? 2;
  const base = (k: string) => 30 + (h(k) % 41);
  return {
    chaos: Math.min(99, base((a.Eyes || '') + (a.Mouth || '') + 'chaos') + tb),
    charm: Math.min(99, base((a.Skin || '') + (a.Body || '') + 'charm') + tb),
    grit: Math.min(99, base((a.Body || '') + (a.Background || '') + 'grit') + tb),
  };
}
export const ENERGY = 3;
export const DEMO_OWNED = [1, 69, 777];
export const title = (rep: number) => rep >= 220 ? 'Chog Legend' : rep >= 170 ? 'Warlord' : rep >= 130 ? 'Troublemaker' : rep >= 90 ? 'Citizen' : 'Outcast';
export type Rel = { bond: number; duels: number; winsA: number };
export function relLabel(r: Rel) {
  if (r.duels >= 5 && r.bond < 0) return { label: 'Nemesis', cls: 'bad' };
  if (r.duels >= 3 && r.bond < 20) return { label: 'Rival', cls: 'warn' };
  if (r.bond >= 70) return { label: 'Sworn Ally', cls: 'ok' };
  if (r.bond >= 30) return { label: 'Friend', cls: 'ok' };
  if (r.bond <= -30) return { label: 'Enemy', cls: 'bad' };
  return { label: 'Acquaintance', cls: '' };
}
export const ACHIEVEMENTS: Record<string, string> = {
  'First Blood': 'Win your first duel', 'Social Butterfly': '3+ friends', 'Rivalry Born': 'Gain a rival', 'Nemesis Forged': 'Gain a nemesis',
  'Chaos Agent': '3 successful pranks', 'Generous Soul': 'Gift $CHOG', 'On a Streak': '3-day streak', 'Famous': 'Reach 150 rep',
};
export type Action = 'challenge' | 'befriend' | 'prank' | 'gift';
export const ACTIONS: Action[] = ['challenge', 'befriend', 'prank', 'gift'];
export type Event = { id: string; t: number; actor: number; target: number; action: Action; success: boolean; text: string; repA: number; repB: number };
export const actionMessage = (p: { tokenId: number; action: string; target: number; nonce: string; issuedAt: number; tx?: string }) =>
  `ChogChronicle action\nChog: ${p.tokenId}\nAction: ${p.action}\nTarget: ${p.target}\nNonce: ${p.nonce}\nIssued: ${p.issuedAt}` + (p.tx ? `\nTx: ${p.tx.toLowerCase()}` : '');
export const CHOG_TOKEN = '0x350035555E10d9AfAF1566AaebfCeD5BA6C27777' as const;
export const GIFT_AMOUNT = 25;
