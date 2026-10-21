// Demo-mode end-to-end test for Pacts + Witnesses. API=http://host/api npx tsx scripts/test-pacts.ts [--sworn]
import { randomUUID } from 'crypto';
const B = process.env.API || 'http://localhost:8787/api';
const j = async (p: string, b?: unknown) => { const r = await fetch(B + p, b ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) } : undefined); return [r.status, await r.json()] as [number, any]; };
const A = 'test-' + randomUUID().slice(0, 12), Bs = 'test-' + randomUUID().slice(0, 12);
const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const pair = async (a: number, b: number) => {
  let [, pv] = await j(`/pact-preview/${a}/${b}`);
  for (let i = 0; i < 3 && !pv.friends; i++) { await j('/action', { tokenId: a, target: b, action: 'befriend', demo: true, demoSession: A }); [, pv] = await j(`/pact-preview/${a}/${b}`); }
  return pv;
};
const balA0 = (await j('/balance/demo:' + A))[1].balance;
const pv = await pair(69, 420); console.log('preview', pv.label.label, 'score', pv.score, pv.tier.name);
ok(pv.friends, '69 & 420 are friends');
ok((await j('/pact/propose', { tokenId: 69, partner: 1969, stake: 25, demo: true, demoSession: A }))[0] === 409, 'non-friend pact rejected');
ok((await j('/pact/propose', { tokenId: 69, partner: 420, stake: 25 }))[0] === 401, 'unsigned non-demo propose rejected');
let [s, r] = await j('/pact/propose', { tokenId: 69, partner: 420, stake: 25, demo: true, demoSession: A }); ok(s === 200 && r.pact.status === 'pending', 'propose ' + s + ' ' + (r.error ?? ''));
const id = r.pact?.id;
[s, r] = await j('/pact/accept', { pactId: id, demo: true, demoSession: Bs }); ok(s === 200 && r.pact.status === 'active' && r.pact.pot === 50, 'accept → active, pot 50 ' + (r.error ?? ''));
[s, r] = await j('/action', { tokenId: 69, target: 420, action: 'challenge', demo: true, demoSession: A }); ok(s === 200 && !!r.betrayal, 'challenge during pact → betrayal ' + JSON.stringify(r.betrayal ?? r.error));
const evId = r.event?.id;
const [, ps] = await j('/pacts?ids=69'); const p = ps.mine.find((x: any) => x.id === id); ok(p?.status === 'betrayed' && p.betrayer === 69, 'pact status betrayed');
ok((await j('/balance/demo:' + Bs))[1].balance === 500 - 25 + 50, 'betrayed owner received the pot');
ok((await j('/balance/demo:' + A))[1].balance === balA0 - 25, 'betrayer lost stake');
const [, sq] = await j('/square'); ok(sq.events.some((e: any) => e.action === 'betrayal'), 'betrayal event on the Square');
ok((await j('/witness', { tokenId: 1, eventId: evId, demo: true, demoSession: A }))[0] === 409, 'self-witness (same owner) rejected');
ok((await j('/witness', { tokenId: 69, eventId: evId, demo: true, demoSession: Bs }))[0] === 409, 'actor cannot witness own moment');
[s, r] = await j('/witness', { tokenId: 1, eventId: evId, demo: true, demoSession: Bs }); ok(s === 200 && r.witnesses.includes(1), 'witness by another owner ' + (r.error ?? ''));
ok((await j('/witness', { tokenId: 1, eventId: evId, demo: true, demoSession: Bs }))[0] === 409, 'double witness rejected');
const [, sq2] = await j('/square'); ok(sq2.events.find((e: any) => e.id === evId)?.witnesses.includes(1), 'Square shows Witnessed by #1');
const [, pv2] = await j('/pact-preview/69/420'); ok(pv2.witnessed >= 1 && pv2.score > pv.score, `witnessed history counts double (score ${pv.score} → ${pv2.score})`);
await j('/presence', { ids: [777] }); const [, sq3] = await j('/square'); ok(sq3.online.some((c: any) => c.tokenId === 777), 'presence shows #777 online');
const [, prof] = await j('/chogs/1'); ok(prof.achievements.includes('Witness'), 'witness badge on #1');
if (process.argv.includes('--sworn')) {
  const pv3 = await pair(777, 7); ok(pv3.friends, '777 & 7 friends');
  [s, r] = await j('/pact/propose', { tokenId: 777, partner: 7, stake: 25, demo: true, demoSession: A }); const id2 = r.pact?.id;
  [s, r] = await j('/pact/accept', { pactId: id2, demo: true, demoSession: Bs }); const wait = r.pact.ends - Date.now() + 1500; console.log('waiting', Math.round(wait / 1000), 's for full term');
  await new Promise(x => setTimeout(x, wait));
  const [, ps2] = await j('/pacts?ids=777'); ok(ps2.mine.find((x: any) => x.id === id2)?.status === 'sworn', 'full term → sworn');
  const [, p7] = await j('/chogs/777'); ok(p7.achievements.includes('Sworn'), 'Sworn badge');
}
// Wallet path: valid EIP-191 signature from a non-owner must pass sig check and fail ownerOf; tampered stake fails sig.
{
  const { privateKeyToAccount, generatePrivateKey } = await import('viem/accounts'); const { pactMessage, witnessMessage } = await import('../shared/pacts');
  const acc = privateKeyToAccount(generatePrivateKey()); const n = async () => (await j('/nonce?address=' + acc.address))[1];
  let k = await n(); let sig = await acc.signMessage({ message: pactMessage({ op: 'propose', tokenId: 42, partner: 1, stake: 25, nonce: k.nonce, issuedAt: k.issuedAt }) });
  ok((await j('/pact/propose', { tokenId: 42, partner: 1, stake: 50, address: acc.address, nonce: k.nonce, issuedAt: k.issuedAt, signature: sig }))[0] === 401, 'tampered stake → bad signature');
  k = await n(); sig = await acc.signMessage({ message: pactMessage({ op: 'propose', tokenId: 42, partner: 1, stake: 25, nonce: k.nonce, issuedAt: k.issuedAt }) });
  ok((await j('/pact/propose', { tokenId: 42, partner: 1, stake: 25, address: acc.address, nonce: k.nonce, issuedAt: k.issuedAt, signature: sig }))[0] === 403, 'signed propose by non-owner → 403');
  const [, sq] = await j('/square'); const e = sq.events.find((x: any) => x.action === 'challenge'); const w = [5, 6, 8].find(x => x !== e.actor && x !== e.target)!;
  k = await n(); sig = await acc.signMessage({ message: witnessMessage({ tokenId: w, eventId: e.id, nonce: k.nonce, issuedAt: k.issuedAt }) });
  ok((await j('/witness', { tokenId: w, eventId: e.id, address: acc.address, nonce: k.nonce, issuedAt: k.issuedAt, signature: sig }))[0] === 403, 'signed witness by non-owner → 403');
}
