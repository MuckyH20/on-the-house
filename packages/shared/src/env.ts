import { z } from 'zod';
import { GEMINI_SANDBOX_HOST } from './constants';

/**
 * Env validation shared by the engine, scripts and the web app's server code.
 * Every integration has a mock mode so the demo runs without credentials.
 */

/** Treat empty strings (common in .env files) as "unset". */
const unsetIfEmpty = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(unsetIfEmpty, schema.optional());
const withDefault = <T extends z.ZodType>(schema: T, value: z.input<T>) =>
  z.preprocess(unsetIfEmpty, schema.default(value as never));

export const base58Pubkey = z
  .string()
  .trim()
  .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, { message: 'must be a base58 public key' });

/** Devnet only: refuse anything that looks like mainnet. (A genesis-hash check also runs at startup.) */
export const devnetRpcUrl = z
  .url()
  .refine((u) => !/mainnet/i.test(u), { message: 'mainnet endpoints are forbidden — this project is devnet-only' });

export const geminiSandboxUrl = z.url().refine((u) => new URL(u).hostname === GEMINI_SANDBOX_HOST, {
  message: `must be https://${GEMINI_SANDBOX_HOST} — trading is sandbox-only`,
});

const bps = z.coerce.number().int().min(0).max(10_000);

export const GeminiMode = z.enum(['mock', 'sandbox']);
export const IngestMode = z.enum(['poll', 'quicknode']);
export const ResolutionSource = z.enum(['mock', 'production', 'sandbox']);
export type GeminiMode = z.infer<typeof GeminiMode>;
export type IngestMode = z.infer<typeof IngestMode>;
export type ResolutionSource = z.infer<typeof ResolutionSource>;

/** Solana connection settings (no deployment required yet). */
export const solanaEnvShape = {
  SOLANA_RPC_URL: withDefault(devnetRpcUrl, 'https://api.devnet.solana.com'),
  /** Optional explicit websocket endpoint; derived from SOLANA_RPC_URL when unset. */
  SOLANA_WS_URL: optional(z.url().refine((u) => !/mainnet/i.test(u), { message: 'mainnet endpoints are forbidden' })),
};

/** Keypairs: a file path (relative to the repo root), a JSON byte array, or a base58 secret key. */
export const keysEnvShape = {
  OPERATOR_KEYPAIR: withDefault(z.string().min(1), '.keys/operator.json'),
  MERCHANT_KEYPAIR: withDefault(z.string().min(1), '.keys/merchant.json'),
  /** Defaults to the operator keypair. */
  ADMIN_KEYPAIR: optional(z.string().min(1)),
};

/** Values written by scripts/setup-devnet.ts once the program is deployed. */
export const deployedEnvShape = {
  PROGRAM_ID: base58Pubkey,
  USDC_MINT: base58Pubkey,
  TREASURY_TOKEN_ACCOUNT: base58Pubkey,
};

export const engineEnvSchema = z
  .object({
    ...solanaEnvShape,
    ...keysEnvShape,
    ...deployedEnvShape,
    ENGINE_HOST: withDefault(z.string(), '0.0.0.0'),
    ENGINE_PORT: withDefault(z.coerce.number().int().min(1).max(65_535), 8787),
    /** Public base URL of this engine (used for the QuickNode webhook destination). */
    PUBLIC_ENGINE_URL: withDefault(z.url(), 'http://localhost:8787'),
    /** Comma-separated list of allowed browser origins, or "*". */
    CORS_ORIGINS: withDefault(z.string(), 'http://localhost:3000'),
    DATABASE_PATH: withDefault(z.string(), 'engine/data/oth.sqlite'),
    LOG_LEVEL: withDefault(z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']), 'info'),

    GEMINI_MODE: withDefault(GeminiMode, 'mock'),
    INGEST_MODE: withDefault(IngestMode, 'poll'),
    RESOLUTION_SOURCE: withDefault(ResolutionSource, 'mock'),
    PLATFORM_MARGIN_BPS: withDefault(bps, 1000),

    /** Public market data (read-only) may come from production. */
    GEMINI_PUBLIC_BASE_URL: withDefault(z.url(), 'https://api.gemini.com'),
    /** Trading is sandbox-only; the client also refuses any other host. */
    GEMINI_SANDBOX_BASE_URL: withDefault(geminiSandboxUrl, 'https://api.sandbox.gemini.com'),
    GEMINI_API_KEY: optional(z.string().min(1)),
    GEMINI_API_SECRET: optional(z.string().min(1)),

    /** QuickNode Streams webhook security token (INGEST_MODE=quicknode). */
    QUICKNODE_STREAM_SECURITY_TOKEN: optional(z.string().min(1)),

    /** Protects the SIMULATED mock-Gemini admin endpoints (resolve, set price). Unset = open (local demo). */
    MOCK_ADMIN_TOKEN: optional(z.string().min(1)),
    /** Starting YES ask for SIMULATED markets, in dollars per $1 contract. */
    MOCK_DEFAULT_ASK: withDefault(z.coerce.number().gt(0).lt(1), 0.25),

    HEDGE_MAX_ATTEMPTS: withDefault(z.coerce.number().int().min(1).max(20), 5),
    HEDGE_RETRY_BASE_MS: withDefault(z.coerce.number().int().min(50), 1000),
    SETTLER_POLL_MS: withDefault(z.coerce.number().int().min(250), 5000),
    BACKFILL_INTERVAL_MS: withDefault(z.coerce.number().int().min(1000), 15_000),
  })
  .superRefine((env, ctx) => {
    const needsGeminiKeys = env.GEMINI_MODE === 'sandbox' || env.RESOLUTION_SOURCE === 'sandbox';
    if (needsGeminiKeys && (!env.GEMINI_API_KEY || !env.GEMINI_API_SECRET)) {
      ctx.addIssue({
        code: 'custom',
        path: ['GEMINI_API_KEY'],
        message: 'GEMINI_API_KEY and GEMINI_API_SECRET are required when GEMINI_MODE=sandbox or RESOLUTION_SOURCE=sandbox',
      });
    }
    if (env.INGEST_MODE === 'quicknode' && !env.QUICKNODE_STREAM_SECURITY_TOKEN) {
      ctx.addIssue({
        code: 'custom',
        path: ['QUICKNODE_STREAM_SECURITY_TOKEN'],
        message: 'QUICKNODE_STREAM_SECURITY_TOKEN is required when INGEST_MODE=quicknode',
      });
    }
  });
export type EngineEnv = z.infer<typeof engineEnvSchema>;

/** Server-side env of the Next.js app (API routes sign as operator / demo merchant). */
export const appServerEnvSchema = z.object({
  ...solanaEnvShape,
  ...keysEnvShape,
  ...deployedEnvShape,
  ENGINE_URL: withDefault(z.url(), 'http://localhost:8787'),
  PLATFORM_MARGIN_BPS: withDefault(bps, 1000),
  /** Demo dollars handed out per faucet call (whole dollars). */
  FAUCET_AMOUNT_USD: withDefault(z.coerce.number().int().min(1).max(1000), 20),
  /** Minimum seconds between faucet calls for the same wallet. */
  FAUCET_COOLDOWN_SECONDS: withDefault(z.coerce.number().int().min(0), 300),
});
export type AppServerEnv = z.infer<typeof appServerEnvSchema>;

export class EnvError extends Error {
  constructor(
    message: string,
    readonly issues: string[],
  ) {
    super(message);
    this.name = 'EnvError';
  }
}

/** Validate an env object, throwing an EnvError that lists every problem in plain words. */
export function parseEnv<T extends z.ZodType>(schema: T, source: Record<string, string | undefined>, label = 'env'): z.infer<T> {
  const result = schema.safeParse(source);
  if (result.success) return result.data;
  const issues = result.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`);
  throw new EnvError(`Invalid ${label}:\n${issues.join('\n')}`, issues);
}
