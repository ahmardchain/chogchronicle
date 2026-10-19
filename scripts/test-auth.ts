// Wallet-signed order checks: tampering, ownership (ownerOf on Monad), nonce replay.
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { orderMessage } from '../shared/daemons.js';
const B = process.env.API || 'http://localhost:8787/api';
const acc = privateKeyToAccount(generatePrivateKey());
const j = async (p: string, b?: unknown) => { const r = await fetch(B + p, b ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) } : undefined); return [r.status, await r.json()]; };
const [, n] = await j('/nonce?address=' + acc.address) as any;
const p = { tokenId: 42, card: 'raid', target: 1, day: n.day, nonce: n.nonce, issuedAt: n.issuedAt };
const signature = await acc.signMessage({ message: orderMessage(p) });
console.log('tampered target ->', await j('/order', { ...p, target: 7, address: acc.address, signature }));
console.log('valid sig, not owner ->', await j('/order', { ...p, address: acc.address, signature }));
console.log('replay nonce ->', await j('/order', { ...p, address: acc.address, signature }));
