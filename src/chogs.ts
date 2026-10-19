import { createPublicClient, http, parseAbi } from 'viem';
import { monad, CHOG_NFT } from './wagmi';
export * from '../shared/stats';
const client = createPublicClient({ chain: monad, transport: http() });
const abi = parseAbi(['function ownerOf(uint256) view returns (address)', 'function balanceOf(address) view returns (uint256)', 'function tokenOfOwnerByIndex(address,uint256) view returns (uint256)']);
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
