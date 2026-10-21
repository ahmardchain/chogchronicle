import { get } from './api';
/** Fetch a DB nonce and sign the message built from it (same EIP-191 scheme as actions). */
export async function signed(address: string, build: (nonce: string, issuedAt: number) => string, sign: (a: { message: string }) => Promise<string>) {
  const { nonce, issuedAt } = await get<{ nonce: string; issuedAt: number }>('/nonce?address=' + address);
  const signature = await sign({ message: build(nonce, issuedAt) });
  return { address, nonce, issuedAt, signature };
}
