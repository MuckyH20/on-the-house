import type { Connection } from '@solana/web3.js';
import { GENESIS_HASH } from './constants';

/** Derive the websocket endpoint web3.js would use for an http(s) RPC URL. */
export function wsUrlFor(rpcUrl: string): string {
  const u = new URL(rpcUrl);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  // The default local validator serves websockets on rpc port + 1.
  if ((u.hostname === 'localhost' || u.hostname === '127.0.0.1') && u.port) {
    u.port = String(Number(u.port) + 1);
  }
  return u.toString();
}

export function isLocalRpc(rpcUrl: string): boolean {
  const host = new URL(rpcUrl).hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0';
}

export class WrongClusterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WrongClusterError';
  }
}

/**
 * Hard rule: Solana devnet only. Checks the genesis hash so a mislabeled RPC URL can't point us at mainnet.
 * A local validator (localhost) is allowed for tests.
 */
export async function assertDevnet(connection: Connection): Promise<'devnet' | 'localnet'> {
  const genesis = await connection.getGenesisHash();
  if (genesis === GENESIS_HASH.devnet) return 'devnet';
  if (genesis === GENESIS_HASH.mainnet) {
    throw new WrongClusterError(`Refusing to run against MAINNET (${connection.rpcEndpoint}). This project is devnet-only.`);
  }
  if (genesis === GENESIS_HASH.testnet) {
    throw new WrongClusterError(`Refusing to run against testnet (${connection.rpcEndpoint}). Use devnet.`);
  }
  if (isLocalRpc(connection.rpcEndpoint)) return 'localnet';
  throw new WrongClusterError(`Unknown cluster (genesis ${genesis}) at ${connection.rpcEndpoint}. Use devnet.`);
}

export function explorerTxUrl(signature: string, cluster: 'devnet' | 'localnet' = 'devnet'): string {
  return cluster === 'devnet'
    ? `https://explorer.solana.com/tx/${signature}?cluster=devnet`
    : `https://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=http%3A%2F%2Flocalhost%3A8899`;
}

export function explorerAddressUrl(address: string, cluster: 'devnet' | 'localnet' = 'devnet'): string {
  return cluster === 'devnet'
    ? `https://explorer.solana.com/address/${address}?cluster=devnet`
    : `https://explorer.solana.com/address/${address}?cluster=custom&customUrl=http%3A%2F%2Flocalhost%3A8899`;
}
