/**
 * Read-only check of the Gemini SANDBOX credentials and what the sandbox offers. Never places orders.
 *   - signed calls: prediction-markets terms status, positions, settled positions, balances
 *   - public: active prediction-market events on the sandbox host
 * Usage: pnpm gemini:probe
 */
import { createHmac } from 'node:crypto';
import { findRepoRoot, loadDotEnv } from '@oth/shared/node';

process.chdir(findRepoRoot());
loadDotEnv(process.env.ENV_FILE || '.env');
const BASE = 'https://api.sandbox.gemini.com';
const key = process.env.GEMINI_API_KEY ?? '';
const secret = process.env.GEMINI_API_SECRET ?? '';
const account = process.env.GEMINI_ACCOUNT || (key.startsWith('master-') ? 'primary' : undefined);
let lastNonce = 0;

async function priv(path: string, method: 'POST' | 'GET' = 'POST', extra: Record<string, unknown> = {}) {
  const nonce = Math.max(Math.floor(Date.now() / 1000), lastNonce + 1);
  lastNonce = nonce;
  const payload = Buffer.from(JSON.stringify({ request: path, nonce, ...(account ? { account } : {}), ...extra })).toString('base64');
  const signature = createHmac('sha384', secret).update(payload).digest('hex');
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'text/plain',
      'Content-Length': '0',
      'X-GEMINI-APIKEY': key,
      'X-GEMINI-PAYLOAD': payload,
      'X-GEMINI-SIGNATURE': signature,
      'Cache-Control': 'no-cache',
    },
  });
  const text = await res.text();
  return { status: res.status, body: text.length > 700 ? `${text.slice(0, 700)}…` : text };
}

async function main() {
  console.log(`key type: ${key.split('-')[0] || '(missing)'}${account ? ` · account param: "${account}"` : ''}`);
  for (const [path, method] of [
    ['/v1/prediction-markets/terms/status', 'GET'],
    ['/v1/prediction-markets/terms/status', 'POST'],
    ['/v1/balances', 'POST'],
    ['/v1/prediction-markets/positions', 'POST'],
    ['/v1/prediction-markets/positions/settled', 'POST'],
  ] as const) {
    const r = await priv(path, method);
    console.log(`\n${method} ${path} → ${r.status}\n${r.body}`);
  }
  const ev = await fetch(`${BASE}/v1/prediction-markets/events?status=active&limit=200`);
  const body = (await ev.json().catch(() => null)) as { data?: { ticker: string; title: string; category: string; expiryDate: string | null; contracts: { instrumentSymbol: string; label: string; prices?: { bestAsk?: string | null } }[] }[]; pagination?: { total: number } } | null;
  console.log(`\nGET sandbox events → ${ev.status} · total active: ${body?.pagination?.total ?? '?'}`);
  for (const e of (body?.data ?? []).slice(0, 12)) {
    const c = e.contracts[0];
    console.log(`  ${e.expiryDate ?? 'no expiry'} · ${e.category} · ${e.title} · ${e.contracts.length} contracts · e.g. ${c?.instrumentSymbol} ask ${c?.prices?.bestAsk ?? '-'}`);
  }
  const cats = new Map<string, number>();
  for (const e of body?.data ?? []) cats.set(e.category, (cats.get(e.category) ?? 0) + 1);
  console.log(`  categories: ${[...cats].map(([k, v]) => `${k} ${v}`).join(', ')}`);
}

main().catch((e) => {
  console.error(`probe failed: ${(e as Error).message}`);
  process.exit(1);
});
