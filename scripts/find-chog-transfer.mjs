import { createPublicClient, http, parseAbiItem } from 'viem';
const c = createPublicClient({ transport: http('https://rpc.monad.xyz') });
const latest = await c.getBlockNumber();
const ev = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');
for (let end = latest; end > latest - 200000n; end -= 100n) {
  const logs = await c.getLogs({ address: '0x350035555E10d9AfAF1566AaebfCeD5BA6C27777', event: ev, fromBlock: end - 99n, toBlock: end }).catch(() => []);
  const l = logs.find(l => l.args.value >= 25n * 10n ** 18n);
  if (l) { console.log(JSON.stringify({ hash: l.transactionHash, from: l.args.from, to: l.args.to, value: l.args.value.toString() })); process.exit(0); }
}
console.log('none');
