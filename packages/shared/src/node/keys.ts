import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

/** Walk up from `start` to the directory containing pnpm-workspace.yaml (the repo root). */
export function findRepoRoot(start: string = process.cwd()): string {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(start);
    dir = parent;
  }
}

/** Resolve a path from env relative to the repo root (absolute paths pass through). */
export function resolveFromRoot(p: string): string {
  return isAbsolute(p) ? p : join(findRepoRoot(), p);
}

/**
 * Load a keypair from an env value that is either:
 *  - a JSON byte array: "[12,34,...]"
 *  - a base58 secret key
 *  - a path to a Solana CLI keypair file (relative to the repo root)
 * Secrets never leave this function except as the Keypair.
 */
export function loadKeypair(value: string, label = 'keypair'): Keypair {
  const v = value.trim();
  if (v.startsWith('[')) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(v) as number[]));
  }
  const path = resolveFromRoot(v);
  if (existsSync(path)) {
    const bytes = JSON.parse(readFileSync(path, 'utf8')) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(bytes));
  }
  if (/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(v)) {
    return Keypair.fromSecretKey(bs58.decode(v));
  }
  throw new Error(`Could not load ${label}: "${v.length > 60 ? `${v.slice(0, 12)}…` : v}" is not a file, JSON array or base58 secret`);
}

/** Load KEY=VALUE pairs from a dotenv file into process.env without overriding existing values. */
export function loadDotEnv(path: string): boolean {
  const full = resolveFromRoot(path);
  if (!existsSync(full)) return false;
  for (const line of readFileSync(full, 'utf8').split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)?\s*$/.exec(line);
    if (!m) continue;
    const key = m[1]!;
    let val = (m[2] ?? '').trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    } else {
      val = val.replace(/\s+#.*$/, '');
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
  return true;
}
