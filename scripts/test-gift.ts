// On-chain $CHOG transfer verification (used for bounties) against a real historical Transfer on Monad.
import { migrate } from '../server/db.js';
import { verifyGiftTx } from '../server/engine.js';
await migrate();
const TX = '0x98365e0863e706275851efad059a1a5995de651620caffa21410611d419b4c22' as const;
const FROM = '0x533a0dF3Dc9f6527b79a96EE1125Adc038380fD0', TO = '0x44ed9B74F4fE2b0975c2B5121B0E906dA6ce4A48';
console.log({ ok: await verifyGiftTx(TX, FROM, TO) ?? 'OK', wrongTo: await verifyGiftTx(TX, FROM, FROM), missing: await verifyGiftTx(('0x' + '12'.repeat(32)) as `0x${string}`, FROM, TO) });
