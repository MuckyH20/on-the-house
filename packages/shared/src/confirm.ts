import type { Commitment, Connection, Keypair, Transaction } from '@solana/web3.js';

/**
 * Wait for a transaction by polling its status (getSignatureStatuses), not websocket notifications — some RPC
 * providers drop those, which made landed transactions look "expired". Browser-safe.
 *
 * Resolves when the transaction reaches `commitment`; throws TxError if it failed on-chain, or TxExpiredError if
 * the blockhash expired without it landing (a final status check runs first, so a late landing still counts).
 */
export class TxError extends Error {
  constructor(
    readonly signature: string,
    readonly detail: string,
  ) {
    super(`transaction ${signature} failed: ${detail}`);
    this.name = 'TxError';
  }
}
export class TxExpiredError extends Error {
  constructor(readonly signature: string) {
    super(`transaction ${signature} expired before it confirmed`);
    this.name = 'TxExpiredError';
  }
}

const rank: Record<string, number> = { processed: 0, confirmed: 1, finalized: 2 };

export async function confirmSignature(
  connection: Connection,
  signature: string,
  lastValidBlockHeight: number,
  commitment: Commitment = 'confirmed',
  pollMs = 800,
): Promise<void> {
  const want = rank[commitment] ?? 1;
  const check = async () => {
    const st = (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0];
    if (st?.err) throw new TxError(signature, JSON.stringify(st.err));
    return !!st?.confirmationStatus && (rank[st.confirmationStatus] ?? -1) >= want;
  };
  for (;;) {
    try {
      if (await check()) return;
    } catch (e) {
      if (e instanceof TxError) throw e; // on-chain failure is final; transport errors just retry
    }
    const height = await connection.getBlockHeight('confirmed').catch(() => 0);
    if (height > lastValidBlockHeight) {
      if (await check().catch(() => false)) return;
      throw new TxExpiredError(signature);
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

/** Sign (if signers given), send and confirm a legacy transaction with a fresh blockhash, polling for status. */
export async function sendAndConfirm(
  connection: Connection,
  tx: Transaction,
  signers: Keypair[],
  opts: { commitment?: Commitment; feePayer?: Keypair } = {},
): Promise<string> {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer ??= (opts.feePayer ?? signers[0])!.publicKey;
  tx.sign(...signers);
  const signature = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 5 });
  await confirmSignature(connection, signature, lastValidBlockHeight, opts.commitment ?? 'confirmed');
  return signature;
}
