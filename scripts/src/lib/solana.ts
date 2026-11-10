import { homedir } from 'node:os';
import {
  Connection,
  type Keypair,
  LAMPORTS_PER_SOL,
  type PublicKey,
  type Signer,
  type Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { assertDevnet, wsUrlFor } from '@oth/shared';

export const SOLANA_BIN = `${homedir()}/.local/share/solana/install/active_release/bin`;

export async function connect(rpcUrl: string, wsUrl?: string): Promise<{ connection: Connection; cluster: 'devnet' | 'localnet' }> {
  const connection = new Connection(rpcUrl, { commitment: 'confirmed', wsEndpoint: wsUrl ?? wsUrlFor(rpcUrl) });
  const cluster = await assertDevnet(connection);
  return { connection, cluster };
}

export const sol = (lamports: number) => (lamports / LAMPORTS_PER_SOL).toFixed(4);

export async function send(connection: Connection, tx: Transaction, signers: Signer[]): Promise<string> {
  return sendAndConfirmTransaction(connection, tx, signers, { commitment: 'confirmed', maxRetries: 5 });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Make sure `who` holds at least `minLamports`. Tries the devnet airdrop a few times; when the faucet
 * is rate-limited (it usually is), prints manual faucet instructions and waits for the balance.
 */
export async function ensureSol(
  connection: Connection,
  who: PublicKey,
  minLamports: number,
  label: string,
  opts: { waitMinutes?: number } = {},
): Promise<number> {
  let balance = await connection.getBalance(who, 'confirmed');
  if (balance >= minLamports) return balance;
  console.log(`\n${label} ${who.toBase58()} has ${sol(balance)} SOL; needs ${sol(minLamports)} SOL.`);

  for (let attempt = 1; attempt <= 4 && balance < minLamports; attempt++) {
    const ask = Math.min(2 * LAMPORTS_PER_SOL, minLamports - balance + 0.05 * LAMPORTS_PER_SOL);
    try {
      process.stdout.write(`  airdrop attempt ${attempt}: requesting ${sol(ask)} SOL… `);
      const sig = await connection.requestAirdrop(who, Math.ceil(ask));
      const bh = await connection.getLatestBlockhash('confirmed');
      await connection.confirmTransaction({ signature: sig, ...bh }, 'confirmed');
      console.log('ok');
    } catch (e) {
      const msg = (e as Error).message;
      console.log(`failed (${msg.split('\n')[0]})`);
      // Public devnet answers 410 "faucet is closed" — retrying is pointless.
      if (/\b410\b|faucet is closed/i.test(msg)) break;
      await sleep(2_000 * attempt);
    }
    balance = await connection.getBalance(who, 'confirmed');
  }
  if (balance >= minLamports) return balance;

  const deadline = Date.now() + (opts.waitMinutes ?? 30) * 60_000;
  console.log(
    [
      '',
      '  The devnet RPC airdrop is unavailable (closed or rate-limited). Fund this address manually, then leave this script running:',
      `    1. Open https://faucet.solana.com (sign in with GitHub for a higher limit)`,
      `    2. Network: Devnet · Address: ${who.toBase58()} · Amount: ${Math.ceil((minLamports - balance) / LAMPORTS_PER_SOL)}+ SOL`,
      `    (or from another funded wallet: solana transfer ${who.toBase58()} <SOL> --url devnet)`,
      `  Waiting for ${sol(minLamports)} SOL (checks every 10s, up to ${opts.waitMinutes ?? 30} min)…`,
    ].join('\n'),
  );
  while (Date.now() < deadline) {
    await sleep(10_000);
    balance = await connection.getBalance(who, 'confirmed');
    if (balance >= minLamports) {
      console.log(`  received: balance is now ${sol(balance)} SOL`);
      return balance;
    }
  }
  throw new Error(`${label} still has only ${sol(balance)} SOL; fund it and re-run.`);
}

export function keypairJson(kp: Keypair): string {
  return JSON.stringify(Array.from(kp.secretKey));
}
