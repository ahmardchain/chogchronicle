import { createPublicClient, http, parseAbi } from 'viem';
import { monad, CHOG_NFT } from './wagmi';
import demo from './demoChogs.json';
export type Attr = { trait_type: string; value: string };
export type Chog = { tokenId: number; name: string; image: string; attributes: Attr[] };
export const DEMO: Chog[] = demo as Chog[];
const client = createPublicClient({ chain: monad, transport: http() });
const abi = parseAbi(['function tokenURI(uint256) view returns (string)', 'function ownerOf(uint256) view returns (address)', 'function balanceOf(address) view returns (uint256)', 'function tokenOfOwnerByIndex(address,uint256) view returns (uint256)']);
const G = 'https://gateway.pinata.cloud/ipfs/';
const cache = new Map<number, Chog>(DEMO.map(c => [c.tokenId, c]));
const LS = 'cc.meta';
try { for (const c of JSON.parse(localStorage.getItem(LS) || '[]')) cache.set(c.tokenId, c); } catch {}
export function knownChogs() { return [...cache.values()]; }
export function getChog(id: number) { return cache.get(id); }
export async function loadChog(id: number): Promise<Chog> {
  const hit = cache.get(id); if (hit) return hit;
  const uri = await client.readContract({ address: CHOG_NFT, abi, functionName: 'tokenURI', args: [BigInt(id)] });
  const m = await (await fetch(uri.replace('ipfs://', G))).json();
  const c = { tokenId: id, name: m.name, image: m.image.replace('ipfs://', G), attributes: m.attributes };
  cache.set(id, c);
  localStorage.setItem(LS, JSON.stringify([...cache.values()].filter(x => !DEMO.find(d => d.tokenId === x.tokenId))));
  return c;
}
export async function ownerOf(id: number) { return client.readContract({ address: CHOG_NFT, abi, functionName: 'ownerOf', args: [BigInt(id)] }); }
/** Try ERC721Enumerable; returns null if unsupported. */
export async function ownedTokenIds(owner: `0x${string}`): Promise<number[] | null> {
  const bal = await client.readContract({ address: CHOG_NFT, abi, functionName: 'balanceOf', args: [owner] });
  if (bal === 0n) return [];
  try {
    const ids: number[] = [];
    for (let i = 0n; i < bal && i < 30n; i++) ids.push(Number(await client.readContract({ address: CHOG_NFT, abi, functionName: 'tokenOfOwnerByIndex', args: [owner, i] })));
    return ids;
  } catch { return null; }
}
// Deterministic stats from on-chain traits
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
export const trait = (c: Chog, k: string) => c.attributes.find(t => t.trait_type === k)?.value;
