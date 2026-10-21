import { useEffect, useState } from 'react';
import { useAccount, useReadContracts } from 'wagmi';
import { erc20Abi, formatUnits } from 'viem';
import { CHOG_TOKEN, DEMO_OWNED, ownedTokenIds, type Chog } from './chogs';
import { demoSession, useBalance, useKnown } from './api';
export function useMyChogs() {
  const { address } = useAccount();
  const [ids, setIds] = useState<number[]>(() => JSON.parse(localStorage.getItem('cc.mine') || 'null') ?? DEMO_OWNED);
  const [note, setNote] = useState('');
  useEffect(() => {
    if (!address) { setIds(JSON.parse(localStorage.getItem('cc.mine') || 'null') ?? DEMO_OWNED); return; }
    ownedTokenIds(address).then(r => {
      if (r === null) { setNote('Contract is not enumerable — add your tokenIds below (ownership is verified on-chain).'); return; }
      if (!r.length) { setNote('This wallet holds no Chog Genesis — disconnect to use demo mode.'); setIds([]); return; }
      setIds(r); setNote(`Loaded ${r.length} Chog(s) from your wallet.`);
    }).catch(e => setNote('Could not read wallet: ' + e.message));
  }, [address]);
  const save = (n: number[]) => { setIds(n); localStorage.setItem('cc.mine', JSON.stringify(n)); };
  return { ids, setIds: save, note, setNote, address };
}
export function useMeta() { const { data } = useKnown(); const m = new Map<number, Chog>(); data?.forEach(c => m.set(c.tokenId, c)); return m; }
export function useChogBalance() {
  const { address } = useAccount(); const { data: mock } = useBalance('demo:' + demoSession);
  const { data } = useReadContracts({ contracts: address ? [{ address: CHOG_TOKEN, abi: erc20Abi, functionName: 'balanceOf', args: [address], chainId: 143 }, { address: CHOG_TOKEN, abi: erc20Abi, functionName: 'decimals', chainId: 143 }] : [], query: { enabled: !!address, refetchInterval: 10000 } });
  if (!address) return { value: mock?.balance, text: `${mock?.balance ?? '…'} $CHOG (demo)`, decimals: 18 };
  const bal = data?.[0]?.result as bigint | undefined, dec = (data?.[1]?.result as number | undefined) ?? 18;
  const v = bal === undefined ? undefined : Number(formatUnits(bal, dec));
  return { value: v, text: v === undefined ? '… $CHOG' : `${v.toLocaleString(undefined, { maximumFractionDigits: 2 })} $CHOG`, decimals: dec };
}
export const short = (n?: string) => n?.replace('CHOG ', 'Chog ');
export const ago = (t: number) => { const m = Math.round((Date.now() - t) / 6e4); return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };
export const ICON = { challenge: '⚔️', befriend: '🤝', prank: '😈', gift: '🎁', pact: '🤞', sworn: '🛡️', betrayal: '💔' } as Record<string, string> & { challenge: string; befriend: string; prank: string; gift: string };
