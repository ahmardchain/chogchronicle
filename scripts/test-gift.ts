// Verifies on-chain gift checks (uses a real historical $CHOG Transfer on Monad) + API guards + per-session demo energy.

import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { verifyGiftTx } from '../server/engine.js';
import { migrate } from '../server/db.js';
await migrate();
import { actionMessage } from '../shared/stats';
const TX = '0x98365e0863e706275851efad059a1a5995de651620caffa21410611d419b4c22' as const;
const FROM = '0x533a0dF3Dc9f6527b79a96EE1125Adc038380fD0', TO = '0x44ed9B74F4fE2b0975c2B5121B0E906dA6ce4A48';
const B = 'http://localhost:8787/api';
const j = async (p: string, b?: unknown) => { const r = await fetch(B + p, b ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) } : undefined); return [r.status, await r.json()]; };
const out: Record<string, unknown> = {};
out['verify: correct from/to'] = await verifyGiftTx(TX, FROM, TO) ?? 'OK';
out['verify: wrong recipient'] = await verifyGiftTx(TX, FROM, FROM);
out['verify: wrong sender'] = await verifyGiftTx(TX, TO, TO);
out['verify: nonexistent tx'] = await verifyGiftTx(('0x' + '12'.repeat(32)) as `0x${string}`, FROM, TO);
const acc = privateKeyToAccount(generatePrivateKey());
const [, n] = await j('/nonce?address=' + acc.address) as any;
const p = { tokenId: 42, action: 'gift', target: 1, nonce: n.nonce, issuedAt: n.issuedAt };
out['api: gift w/o txHash'] = await j('/action', { ...p, address: acc.address, signature: await acc.signMessage({ message: actionMessage(p) }) });
out['api: gift sig not covering tx'] = await j('/action', { ...p, txHash: TX, address: acc.address, signature: await acc.signMessage({ message: actionMessage(p) }) });
// per-session demo energy: session A exhausts token 1, session B still has full energy
const A = 'sessA-' + Date.now(), Bs = 'sessB-' + Date.now();
const codes = []; for (let i = 0; i < 4; i++) codes.push((await j('/action', { tokenId: 1, target: 42, action: 'befriend', demo: true, demoSession: A }))[0]);
out['demo A x4 statuses'] = codes;
out['demo B first action'] = (await j('/action', { tokenId: 1, target: 42, action: 'befriend', demo: true, demoSession: Bs }))[0];
out['demo gift A mock balance'] = (await j('/action', { tokenId: 69, target: 7, action: 'gift', demo: true, demoSession: A }) as any)[1].balance;
console.log(JSON.stringify(out, null, 1));
