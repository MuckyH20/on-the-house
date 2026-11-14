/**
 * QuickNode Stream for On the House (QuickNode Streams REST API):
 *   network solana-devnet · dataset programs_with_logs · filter engine/quicknode/filter.js (our PROGRAM_ID only)
 *   → webhook ${PUBLIC_ENGINE_URL}/webhooks/quicknode, signed with QUICKNODE_STREAM_SECURITY_TOKEN.
 *
 * Streams bills every block processed (filters don't reduce credits) and Solana devnet makes ~2.5 blocks/s, so the
 * stream only exists while we need it. On the free plan a stream may not backfill more than 100 solana-devnet
 * blocks, and a paused stream resumes from where it stopped — so pausing and resuming a few minutes later gets the
 * stream TERMINATED (seen live 2026-11-12). Instead `on` (re)creates the stream at the chain tip and `off` deletes it.
 *
 * Usage:
 *   pnpm stream on        delete any old stream, create a fresh one at the tip (active)
 *   pnpm stream off       delete the stream (stops billing)
 *   pnpm stream status    show the stream
 *   pnpm stream test [slot]  run the filter against a devnet slot (QuickNode test_filter)
 */
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findRepoRoot, loadDotEnv } from '@oth/shared/node';
import { updateEnvFile } from './lib/envfile';

const ROOT = findRepoRoot();
process.chdir(ROOT);
const ENV_FILE = process.env.ENV_FILE || '.env';
loadDotEnv(ENV_FILE);
const API = 'https://api.quicknode.com/streams/rest/v1';
const EXTERNAL_ID = 'on-the-house-devnet';
const NAME = 'On the House — devnet program events';

const apiKey = process.env.QUICKNODE_API_KEY;
const programId = process.env.PROGRAM_ID;
if (!apiKey) throw new Error('QUICKNODE_API_KEY missing in .env');
if (!programId) throw new Error('PROGRAM_ID missing in .env (run pnpm setup:devnet)');

interface Stream {
  id: string;
  name: string;
  status: string;
  network: string;
  dataset: string;
  external_id?: string | null;
  destination_attributes?: { url?: string; security_token?: string };
}

async function qn<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'x-api-key': apiKey!, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`QuickNode ${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  return (text ? JSON.parse(text) : null) as T;
}

function filterBase64(): string {
  const src = readFileSync(join(ROOT, 'engine/quicknode/filter.js'), 'utf8').replaceAll('__PROGRAM_ID__', programId!);
  return Buffer.from(src).toString('base64');
}

async function findStream(): Promise<Stream | null> {
  const r = await qn<{ data: Stream[] }>('GET', '/streams?limit=100');
  return r.data.find((s) => s.external_id === EXTERNAL_ID || s.name === NAME) ?? null;
}

function show(s: Stream) {
  const url = s.destination_attributes?.url ?? '?';
  console.log(`stream ${s.id} · ${s.status} · ${s.network}/${s.dataset} → ${url}`);
}

function destination(): Record<string, unknown> {
  const engineUrl = (process.env.PUBLIC_ENGINE_URL || '').replace(/\/$/, '');
  if (!/^https:\/\//.test(engineUrl) || /localhost|127\.0\.0\.1/.test(engineUrl)) {
    throw new Error(`PUBLIC_ENGINE_URL must be a public https URL QuickNode can reach (got "${engineUrl}"). Start a tunnel first.`);
  }
  let token = process.env.QUICKNODE_STREAM_SECURITY_TOKEN;
  if (!token || token.length < 32) {
    token = randomBytes(32).toString('base64url'); // 43 chars, ≥ 32 as the API requires
    updateEnvFile(join(ROOT, ENV_FILE), { QUICKNODE_STREAM_SECURITY_TOKEN: token });
    console.log(`generated QUICKNODE_STREAM_SECURITY_TOKEN → ${ENV_FILE} (restart the engine so it can verify deliveries)`);
  }
  return {
    url: `${engineUrl}/webhooks/quicknode`,
    compression: 'none',
    headers: {},
    max_retry: 5,
    retry_interval_sec: 1,
    post_timeout_sec: 10,
    security_token: token,
  };
}

async function off(): Promise<boolean> {
  const existing = await findStream();
  if (!existing) return false;
  await qn('DELETE', `/streams/${existing.id}`);
  console.log(`deleted stream ${existing.id} (${existing.status})`);
  return true;
}

/** Current confirmed slot from our RPC — streams left to pick their own start began ~90 blocks behind the tip. */
async function tipSlot(): Promise<number> {
  const rpc = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const r = await fetch(rpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSlot', params: [{ commitment: 'confirmed' }] }),
  });
  return ((await r.json()) as { result: number }).result;
}

async function on() {
  const dest = destination();
  await off();
  const start = await tipSlot();
  const s = await qn<Stream>('POST', '/streams', {
    name: NAME,
    external_id: EXTERNAL_ID,
    network: 'solana-devnet',
    dataset: 'programs_with_logs',
    filter_function: filterBase64(),
    region: 'usa_east',
    // Docs say sub-second-block networks need ≥ 5, but the free plan caps batches at 1 (API: "5 > 1").
    dataset_batch_size: Number(process.env.QUICKNODE_BATCH_SIZE ?? 1),
    elastic_batch_enabled: true, // deliver at the tip without waiting for a full batch
    fix_block_reorgs: 0,
    keep_distance_from_tip: 0,
    // Start exactly at the tip: the free plan terminates a solana-devnet stream that falls > 100 blocks behind.
    start_range: start,
    destination: 'webhook',
    destination_attributes: dest,
    status: 'active',
  });
  console.log(`created stream ${s.id} starting at slot ${start} (chain tip)`);
  const after = await findStream();
  if (after) show(after);
  console.log('Remember: pnpm stream off when done (it bills ~2.5 blocks/s).');
}

async function testFilter(slotArg?: string) {
  let slot = slotArg;
  if (!slot) {
    const rpc = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    const r = await fetch(rpc, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSignaturesForAddress', params: [programId, { limit: 1 }] }),
    });
    slot = String(((await r.json()) as { result: { slot: number }[] }).result[0]?.slot);
  }
  const out = await qn<{ result: unknown; logs?: unknown }>('POST', '/streams/test_filter', {
    network: 'solana-devnet',
    dataset: 'programs_with_logs',
    filter_function: filterBase64(),
    block: slot,
  });
  console.log(`slot ${slot}: ${JSON.stringify(out.result).slice(0, 600)}`);
}

const [cmd, arg] = process.argv.slice(2);
const run = { create: on, on, off: async () => {
  if (!(await off())) console.log('no stream to delete');
}, status: async () => {
  const s = await findStream();
  if (s) show(s);
  else console.log('no stream (off). Turn on with: pnpm stream on');
}, test: () => testFilter(arg) }[cmd ?? 'status'];

if (!run) {
  console.error('usage: pnpm stream on | off | status | test [slot]');
  process.exit(1);
}
run().catch((e) => {
  console.error(`stream: ${(e as Error).message}`);
  process.exit(1);
});
