/** Pacts + Witnesses: shared constants (client + server). Additive module. */
export type Tier = { name: 'Bronze' | 'Silver' | 'Gold'; min: number; maxStake: number; days: number };
export const TIERS: Tier[] = [
  { name: 'Bronze', min: 0, maxStake: 25, days: 1 },
  { name: 'Silver', min: 6, maxStake: 50, days: 3 },
  { name: 'Gold', min: 14, maxStake: 100, days: 7 },
];
/** Shared history score: every event between the pair counts 1, a witnessed event counts 2. */
export const tierFor = (score: number) => [...TIERS].reverse().find(t => score >= t.min)!;
export const STAKES = [25, 50, 100];
export const WITNESS_WINDOW_MS = 10 * 60 * 1000;
export const WITNESS_REP = 3;
/** Demo pacts run in minutes instead of days so the full term can be shown live. */
export const DEMO_MINUTES_PER_DAY = 2;
export const PACT_ACHIEVEMENTS: Record<string, string> = {
  'Sworn': 'Complete a Pact to full term', 'Betrayed': 'Was betrayed during a Pact', 'Oathbreaker': 'Broke a Pact',
  'Witness': 'Witness another Chog\'s moment', 'Seen': 'Have a moment witnessed',
};
export type PactStatus = 'pending' | 'active' | 'sworn' | 'betrayed' | 'cancelled';
export type Pact = { id: string; a: number; b: number; stake: number; tier: Tier['name']; score: number; status: PactStatus; created: number; accepted: number | null; ends: number | null;
  demo: boolean; mode: 'demo' | 'escrow' | 'pledge'; betrayer: number | null; owedTo: string | null; pot: number };
export const pactMessage = (p: { op: 'propose' | 'accept'; tokenId: number; partner: number; stake: number; pactId?: string; nonce: string; issuedAt: number; tx?: string }) =>
  `ChogChronicle pact\nOp: ${p.op}\nChog: ${p.tokenId}\nPartner: ${p.partner}\nStake: ${p.stake} $CHOG` + (p.pactId ? `\nPact: ${p.pactId}` : '') + `\nNonce: ${p.nonce}\nIssued: ${p.issuedAt}` + (p.tx ? `\nTx: ${p.tx.toLowerCase()}` : '');
export const witnessMessage = (p: { tokenId: number; eventId: string; nonce: string; issuedAt: number }) =>
  `ChogChronicle witness\nChog: ${p.tokenId}\nEvent: ${p.eventId}\nNonce: ${p.nonce}\nIssued: ${p.issuedAt}`;
