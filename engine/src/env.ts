import { engineEnvSchema, parseEnv, type EngineEnv } from '@oth/shared';
import { loadDotEnv } from '@oth/shared/node';

/** Load `.env` from the repo root (never overriding real env vars) and validate it. */
export function loadEngineEnv(source: Record<string, string | undefined> = process.env): EngineEnv {
  if (source === process.env) loadDotEnv(process.env.ENV_FILE || '.env');
  return parseEnv(engineEnvSchema, source, 'engine env (.env)');
}
