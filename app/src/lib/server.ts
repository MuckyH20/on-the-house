import 'server-only';
import { Connection, type Keypair, PublicKey } from '@solana/web3.js';
import { appServerEnvSchema, assertDevnet, parseEnv, wsUrlFor, type AppServerEnv } from '@oth/shared';
import { loadKeypair } from '@oth/shared/node';
import { getProgram, type OthProgram } from '@oth/shared/program';

/** Server-only context for API routes: validated env, RPC connection, program client, operator + demo merchant keys. */
export interface ServerCtx {
  env: AppServerEnv;
  connection: Connection;
  program: OthProgram;
  operator: Keypair;
  merchant: Keypair;
  usdcMint: PublicKey;
  treasury: PublicKey;
  cluster: 'devnet' | 'localnet';
}

let ctx: Promise<ServerCtx> | null = null;

export function serverCtx(): Promise<ServerCtx> {
  ctx ??= (async () => {
    const env = parseEnv(appServerEnvSchema, process.env, 'web app env (app/.env.local)');
    const connection = new Connection(env.SOLANA_RPC_URL, { commitment: 'confirmed', wsEndpoint: env.SOLANA_WS_URL ?? wsUrlFor(env.SOLANA_RPC_URL) });
    const cluster = await assertDevnet(connection);
    return {
      env,
      connection,
      cluster,
      program: getProgram(connection, new PublicKey(env.PROGRAM_ID)),
      operator: loadKeypair(env.OPERATOR_KEYPAIR, 'operator'),
      merchant: loadKeypair(env.MERCHANT_KEYPAIR, 'demo merchant'),
      usdcMint: new PublicKey(env.USDC_MINT),
      treasury: new PublicKey(env.TREASURY_TOKEN_ACCOUNT),
    };
  })().catch((e) => {
    ctx = null;
    throw e;
  });
  return ctx;
}

export async function engineFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { env } = await serverCtx();
  const res = await fetch(`${env.ENGINE_URL.replace(/\/$/, '')}${path}`, { ...init, cache: 'no-store' });
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new HttpError(res.status === 404 ? 404 : 502, body.error ?? `engine ${path} → ${res.status}`);
  return body;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function jsonError(e: unknown, headers?: HeadersInit): Response {
  const status = e instanceof HttpError ? e.status : 500;
  const message = e instanceof Error ? e.message : String(e);
  if (status >= 500) console.error('[api]', message);
  return Response.json({ error: message }, { status, headers });
}

export function parsePubkey(s: unknown, what = 'address'): PublicKey {
  try {
    if (typeof s !== 'string') throw new Error();
    return new PublicKey(s);
  } catch {
    throw new HttpError(400, `invalid ${what}`);
  }
}
