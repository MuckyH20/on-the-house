import {
  type Commitment,
  Connection,
  type Keypair,
  PublicKey,
  Transaction,
  type TransactionInstruction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { assertDevnet, confirmSignature, TxError, wsUrlFor, type EngineEnv } from '@oth/shared';
import { loadKeypair } from '@oth/shared/node';
import { fetchConfig, getProgram, type OthProgram } from '@oth/shared/program';

export interface Chain {
  connection: Connection;
  program: OthProgram;
  programId: PublicKey;
  operator: Keypair;
  usdcMint: PublicKey;
  treasury: PublicKey;
  cluster: 'devnet' | 'localnet';
}

export async function connectChain(env: EngineEnv): Promise<Chain> {
  const connection = new Connection(env.SOLANA_RPC_URL, {
    commitment: 'confirmed',
    wsEndpoint: env.SOLANA_WS_URL ?? wsUrlFor(env.SOLANA_RPC_URL),
  });
  const cluster = await assertDevnet(connection);
  const programId = new PublicKey(env.PROGRAM_ID);
  const program = getProgram(connection, programId);
  const operator = loadKeypair(env.OPERATOR_KEYPAIR, 'operator');
  const config = await fetchConfig(program);
  if (!config) throw new Error(`Program ${programId.toBase58()} has no config yet — run \`pnpm setup:devnet\`.`);
  if (config.operator !== operator.publicKey.toBase58()) {
    throw new Error(`OPERATOR_KEYPAIR is ${operator.publicKey.toBase58()} but the on-chain operator is ${config.operator}.`);
  }
  if (config.usdcMint !== env.USDC_MINT) throw new Error(`USDC_MINT ${env.USDC_MINT} != on-chain config ${config.usdcMint}`);
  return {
    connection,
    program,
    programId,
    operator,
    usdcMint: new PublicKey(config.usdcMint),
    treasury: new PublicKey(config.treasury),
    cluster,
  };
}

/**
 * Sign and send, returning the signature *before* confirmation via `onSigned`, so callers can persist it and
 * avoid double-sending after a crash. Retries with a fresh blockhash if the first one expires.
 */
export async function sendIxs(
  chain: Chain,
  ixs: TransactionInstruction[],
  opts: { signers?: Keypair[]; onSigned?: (signature: string) => void; attempts?: number; commitment?: Commitment } = {},
): Promise<string> {
  const { connection, operator } = chain;
  const signers = [operator, ...(opts.signers ?? [])];
  const attempts = opts.attempts ?? 3;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    const tx = new Transaction({ feePayer: operator.publicKey, blockhash, lastValidBlockHeight }).add(...ixs);
    tx.sign(...signers);
    const signature = bs58.encode(tx.signature!);
    opts.onSigned?.(signature);
    try {
      await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 5 });
      try {
        await confirmSignature(connection, signature, lastValidBlockHeight, opts.commitment ?? 'confirmed');
      } catch (e) {
        if (e instanceof TxError) throw new TxFailedError(signature, e.detail);
        throw e;
      }
      return signature;
    } catch (e) {
      lastErr = e;
      // Program errors are final; only blockhash expiry / transport problems are retried.
      if (e instanceof TxFailedError || isProgramError(e)) throw e;
    }
  }
  throw lastErr;
}

export class TxFailedError extends Error {
  constructor(
    readonly signature: string,
    detail: string,
  ) {
    super(`transaction ${signature} failed: ${detail}`);
    this.name = 'TxFailedError';
  }
}

function isProgramError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /custom program error|Simulation failed|InstructionError/i.test(msg);
}

/** Anchor error name from a failed transaction's message/logs, if any ("UnhedgedLimitExceeded"). */
export function anchorErrorName(e: unknown): string | null {
  const text = e instanceof Error ? `${e.message}\n${((e as { logs?: string[] }).logs ?? []).join('\n')}` : String(e);
  const m = /Error Code: (\w+)/.exec(text);
  return m ? m[1]! : null;
}
