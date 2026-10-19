import { useEffect, useState } from 'react';
import { useAccount, useReadContracts } from 'wagmi';
import { erc20Abi, formatUnits } from 'viem';
import { CHOG_TOKEN, ownedTokenIds } from './chogs';
import { demoSession, useMe } from './api';
/** Who am I playing as: wallet-owned Chogs, or the demo guest daemon. */
export function useKeeper() {
  const { address } = useAccount(); const { data: me, refetch } = useMe();
  const [owned, setOwned] = useState<number[] | null>(null); const [note, setNote] = useState('');
  useEffect(() => {
    if (!address) { setOwned(null); return; }
    ownedTokenIds(address).then(r => {
      if (r === null) { setOwned(JSON.parse(localStorage.getItem('cc.mine.' + address) || '[]')); setNote('Collection is not enumerable — add your Chog tokenIds manually (ownership is verified on-chain when you sign).'); }
      else { setOwned(r); if (!r.length) setNote('This wallet holds no Chog Genesis. Disconnect to play with a guest daemon.'); }
    }).catch(e => setNote('Could not read wallet: ' + e.message));
  }, [address]);
  const addManual = (id: number) => { if (!address) return; const n = [...new Set([...(owned ?? []), id])]; setOwned(n); localStorage.setItem('cc.mine.' + address, JSON.stringify(n)); };
  if (address) return { mode: 'wallet' as const, address, ids: owned ?? [], viewer: address.toLowerCase(), note, addManual, me, refetchMe: refetch };
  return { mode: 'demo' as const, address: undefined, ids: me?.tokenId ? [me.tokenId] : [], viewer: 'demo:' + demoSession, note, addManual, me, refetchMe: refetch };
}
export function useChogBalance() {
  const { address } = useAccount(); const { data: me } = useMe();
  const { data } = useReadContracts({ contracts: address ? [{ address: CHOG_TOKEN, abi: erc20Abi, functionName: 'balanceOf', args: [address], chainId: 143 }, { address: CHOG_TOKEN, abi: erc20Abi, functionName: 'decimals', chainId: 143 }] : [], query: { enabled: !!address, refetchInterval: 15000 } });
  if (!address) return { text: `${me?.balance ?? 500} $CHOG (demo)`, decimals: 18 };
  const bal = data?.[0]?.result as bigint | undefined, dec = (data?.[1]?.result as number | undefined) ?? 18;
  return { text: bal === undefined ? '… $CHOG' : `${Number(formatUnits(bal, dec)).toLocaleString(undefined, { maximumFractionDigits: 2 })} $CHOG`, decimals: dec };
}
export const short = (n?: string) => n?.replace('CHOG ', 'Chog ');
export const ago = (t: number) => { const m = Math.round((Date.now() - t) / 6e4); return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };
export function useCountdown(to?: number) { const [n, setN] = useState(Date.now()); useEffect(() => { const i = setInterval(() => setN(Date.now()), 1000); return () => clearInterval(i); }, []); if (!to) return '--:--'; const s = Math.max(0, Math.round((to - n) / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
