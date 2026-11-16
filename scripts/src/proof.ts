/**
 * Live proof run: does a real promo end to end and prints, for every step, the official link that proves it
 * (Solana Explorer, Gemini's own API) and the code that does it. Saves a Markdown report to docs/local/proof/.
 *
 *   Act 1 · Real Gemini: a promo on a live Gemini market → a customer pays on Solana → the engine buys protection on
 *           Gemini → Gemini's own order history is checked against the Solana record (sha256 of the order id).
 *   Act 2 · A full game night: a promo on a practice game → a customer pays → the game is ended as a win (signed by
 *           the shop) → the result is recorded on Solana and the customer's refund is paid automatically.
 *
 * Usage: pnpm proof [--real-only | --practice-only]   (needs the engine and the app running; APP_URL / PUBLIC_ENGINE_URL
 *        default to localhost). Test networks only: Solana devnet and Gemini's sandbox, with demo dollars.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { confirmSignature, formatUsd, wsUrlFor } from '@oth/shared';
import type { CampaignState, MarketSummary, WalletClaim } from '@oth/shared/api';
import { findRepoRoot, loadDotEnv } from '@oth/shared/node';

const ROOT = findRepoRoot();
process.chdir(ROOT);
loadDotEnv(process.env.ENV_FILE || '.env');
const APP = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
const ENGINE = (process.env.PUBLIC_ENGINE_URL || 'http://localhost:8787').replace(/\/$/, '');
const RPC = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const args = new Set(process.argv.slice(2));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- output (terminal + Markdown report)

const tty = process.stdout.isTTY;
const c = (code: string) => (s: string) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = c('1');
const dim = c('2');
const green = c('32');
const orange = c('38;5;208');
const report: string[] = [];

/** Hard-wraps report text at 80 columns so the saved Markdown reads well in `cat`. */
function wrap(text: string, first = '', rest = first, width = 80): string {
  const lines: string[] = [];
  let line = '';
  for (const word of text.replace(/\x1b\[[0-9;]*m/g, '').split(/\s+/).filter(Boolean)) {
    const indent = lines.length ? rest : first;
    if (line && indent.length + line.length + 1 + word.length > width) {
      lines.push(indent + line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  lines.push((lines.length ? rest : first) + line);
  return lines.join('\n');
}

function act(title: string, intro: string) {
  console.log(`\n${orange('━'.repeat(72))}\n${bold(orange(title.toUpperCase()))}\n${dim(intro)}`);
  report.push(`\n## ${title}\n\n${wrap(intro)}\n`);
}
let stepNo = 0;
function step(title: string) {
  stepNo++;
  console.log(`\n${bold(`${stepNo}. ${title}`)}`);
  report.push(`\n### ${stepNo}. ${title}\n`);
}
function say(text: string, toReport = true) {
  console.log(`   ${text}`);
  if (toReport) report.push(`\n${wrap(text)}\n`);
}
function ok(text: string) {
  console.log(`   ${green('✓')} ${text}`);
  report.push(wrap(text, '- ✅ ', '  '));
}
function link(label: string, url: string) {
  console.log(`   ${dim(label + ':')} ${url}`);
  report.push(`${wrap(`${label}:`, '- ', '  ')}\n  <${url}>`);
}
function code(label: string, ref: string) {
  console.log(`   ${dim('code · ' + label + ':')} ${ref}`);
  report.push(wrap(`Code · ${label}: \`${ref}\``, '- ', '  '));
}

const tx = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
const addr = (a: string) => `https://explorer.solana.com/address/${a}?cluster=devnet`;
const tokens = (a: string) => `https://explorer.solana.com/address/${a}/tokens?cluster=devnet`;
const geminiEvent = (eventId: string) => `https://api.sandbox.gemini.com/v1/prediction-markets/events/${eventId}`;

/** "file:line" for the first line containing `needle`, computed at run time so references never drift. */
function ref(file: string, needle: string): string {
  try {
    const lines = readFileSync(join(ROOT, file), 'utf8').split('\n');
    const i = lines.findIndex((l) => l.includes(needle));
    return i >= 0 ? `${file}:${i + 1}` : file;
  } catch {
    return file;
  }
}

// ---------------------------------------------------------------- HTTP helpers

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  // The deployed site only lets the project's own scripts act as the demo shop (DEMO_API_KEY, sent to the app only).
  const demoKey = process.env.DEMO_API_KEY && url.startsWith(APP) ? { 'x-demo-key': process.env.DEMO_API_KEY } : {};
  const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...demoKey, ...init?.headers } });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${url} → ${res.status}: ${body.error ?? ''}`);
  return body;
}
const state = (campaign: string) => j<CampaignState>(`${ENGINE}/campaigns/${campaign}/state`);
async function until<T>(what: string, load: () => Promise<T>, done: (v: T) => boolean, seconds = 90): Promise<T> {
  let v = await load();
  for (let i = 0; i < seconds && !done(v); i++) {
    await sleep(1000);
    v = await load();
  }
  if (!done(v)) throw new Error(`timed out waiting for ${what}`);
  return v;
}

interface Health {
  cluster: string;
  programId: string;
  usdcMint: string;
  operator: string;
  geminiMode: string;
  ingestMode: string;
  simulated: { gemini: boolean; resolution: boolean };
}

// ---------------------------------------------------------------- the shared promo flow

/** Launch a promo, have a fresh customer pay for a latte, and wait until the refund is protected. */
async function runPromo(connection: Connection, health: Health, m: MarketSummary) {
  const ask = Number(m.yesAsk);
  const maxCostPct = Math.min(100, Math.ceil(ask * 100 * 1.1 * 1.5));

  step('A shop launches a promo');
  const { campaign } = await j<{ campaign: string }>(`${APP}/api/campaigns`, {
    method: 'POST',
    body: JSON.stringify({ marketSymbol: m.symbol, refundPct: 100, maxCostPct, liabilityCapUsd: 100, maxUnhedgedUsd: 10, deadlineMinutes: 20 }),
  });
  say(`Offer: ${bold('the order is free')} if ${bold(m.condition)} (market odds ${Math.round(ask * 100)}%).`);
  say(`Shop's limit: at most ${maxCostPct}% of each sale; at most $10 of refunds may ever be uncovered (enforced on Solana).`);
  const created = await until('the promo on chain', () => state(campaign), (s) => s.events.some((e) => e.name === 'campaignCreated'), 60);
  const createdEv = created.events.find((e) => e.name === 'campaignCreated')!;
  ok(`Promo account created on Solana devnet: ${campaign}`);
  link('Promo account (Solana Explorer)', addr(campaign));
  link('Launch transaction (Solana Explorer)', tx(createdEv.signature));
  link('Customer page', `${APP}/p/${campaign}`);
  code('promo + non-transferable refund token', ref('programs/on_the_house/src/instructions/create_campaign.rs', 'ExtensionType::NonTransferable'));

  step('A customer pays $4.50 for a latte');
  const customer = Keypair.generate();
  await j(`${APP}/api/faucet`, { method: 'POST', body: JSON.stringify({ wallet: customer.publicKey.toBase58() }) });
  say(`New customer wallet ${customer.publicKey.toBase58().slice(0, 8)}… got $20 in demo dollars (fees are paid by the platform).`);
  const pay = await j<{ transaction: string; refund: string; premium: string }>(`${APP}/api/pay/${campaign}?amount=4.50&item=Oat%20latte`, {
    method: 'POST',
    body: JSON.stringify({ account: customer.publicKey.toBase58() }),
  });
  const t = Transaction.from(Buffer.from(pay.transaction, 'base64'));
  t.partialSign(customer);
  const lastValid = (await connection.getBlockHeight('confirmed')) + 150;
  const purchaseSig = await connection.sendRawTransaction(t.serialize());
  await confirmSignature(connection, purchaseSig, lastValid, 'confirmed');
  await fetch(`${ENGINE}/campaigns/${campaign}/kick`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  const order = purchaseSig.replace(/[^A-Za-z0-9]/g, '').slice(0, 5).toUpperCase();
  const premium = Number(pay.premium) / 1e6;
  ok(`Paid in one Solana transaction (order #${order}): $${(4.5 - premium).toFixed(2)} to the shop, $${premium.toFixed(2)} promo cost, and a ${formatUsd(pay.refund)} refund claim to the customer.`);
  link('Purchase transaction (Solana Explorer)', tx(purchaseSig));
  link("Customer's tokens: demo dollars + refund claim (Solana Explorer)", tokens(customer.publicKey.toBase58()));
  code('the rules every sale must pass', ref('programs/on_the_house/src/instructions/purchase.rs', 'UnhedgedLimitExceeded'));

  step('The engine hears about the sale and protects the refund');
  const covered = await until(
    'the refund to be protected',
    () => state(campaign),
    (s) => s.coverageBps >= 10_000 && s.fills.length > 0 && s.fills.every((f) => f.recordTx) && s.events.some((e) => e.name === 'hedgeRecorded'),
    120,
  );
  const purchaseEv = covered.events.find((e) => e.name === 'purchaseEvent');
  const via = purchaseEv?.source ?? 'unknown';
  if (via === 'quicknode') ok('The sale reached the engine through QuickNode Streams (signature-checked webhook).');
  else say(`The sale reached the engine via ${bold(via)}${health.ingestMode === 'poll' ? ' (this engine runs in poll mode; the deployed engine uses QuickNode Streams)' : ''}.`);
  code('QuickNode webhook signature check', ref('engine/src/quicknode.ts', 'export function verifyQuickNode'));
  const fill = covered.fills[0]!;
  const venue = fill.simulated ? 'the practice market (simulated)' : 'Gemini’s prediction market (sandbox)';
  ok(`Bought ${fill.contracts} YES contract(s) at $${(Number(fill.priceMicros) / 1e6).toFixed(2)} on ${venue}, order ${fill.orderId}.`);
  ok(`Recorded on Solana with a fingerprint of that order id. Promised ${formatUsd(covered.promised)} = protected ${formatUsd(covered.covered)}.`);
  link('Protection record (Solana Explorer)', tx(fill.recordTx!));
  link('Public protection page', `${APP}/proof/${campaign}`);
  code('buy on Gemini', ref('engine/src/hedger.ts', 'this.venue.buyYes('));
  code('record on Solana', ref('engine/src/hedger.ts', 'recordHedgeIx(this.chain.program'));
  return { campaign, customer, fill };
}

async function usdcBalance(connection: Connection, owner: PublicKey, mint: string): Promise<bigint> {
  const res = await connection.getParsedTokenAccountsByOwner(owner, { mint: new PublicKey(mint) }, 'confirmed');
  return res.value.reduce((s, a) => s + BigInt((a.account.data as { parsed: { info: { tokenAmount: { amount: string } } } }).parsed.info.tokenAmount.amount), 0n);
}

// ---------------------------------------------------------------- main

async function main() {
  const connection = new Connection(RPC, { commitment: 'confirmed', wsEndpoint: wsUrlFor(RPC) });
  const health = await j<Health>(`${ENGINE}/health`);
  const startedAt = new Date();
  report.push(`# On the House — live proof run\n\n${wrap(`${startedAt.toUTCString()} · Solana ${health.cluster} · Gemini ${health.geminiMode} · test money only`)}`);

  act('Setup', 'Which program, network and venues this run uses.');
  step('The deployed Solana program');
  ok(`Program ${health.programId} on Solana ${health.cluster}.`);
  link('Program (Solana Explorer)', addr(health.programId));
  link('Program (Solscan)', `https://solscan.io/account/${health.programId}?cluster=devnet`);
  link('Platform wallet that pays every fee', addr(health.operator));
  link('Demo dollar token (dUSDC)', addr(health.usdcMint));
  say(`Gemini mode: ${bold(health.geminiMode)} · new sales arrive via: ${bold(health.ingestMode)}.`);

  const { markets } = await j<{ markets: MarketSummary[] }>(`${ENGINE}/markets?limit=500`);
  const soon = Date.now() + 35 * 60_000;
  const real = markets
    .filter((m) => m.source === 'gemini' && !m.simulated && m.yesAsk && Number(m.yesAsk) >= 0.05 && Number(m.yesAsk) <= 0.6 && (!m.closesAt || Date.parse(m.closesAt) > soon))
    .sort((a, b) => (Date.parse(a.closesAt ?? '') || 0) - (Date.parse(b.closesAt ?? '') || 0))[0];
  const practice = markets.find((m) => m.symbol.startsWith('SIM-PRACTICE-') && m.yesAsk && m.status === 'open');

  // ---- Act 1: real Gemini
  if (!args.has('--practice-only')) {
    act('Act 1 · Real Gemini', 'A promo on a live Gemini prediction market. The protection is a real signed order on Gemini’s sandbox, checked against Gemini’s own records.');
    if (!real) {
      step('Find a live Gemini game');
      say('No Gemini game has sellers right now (the sandbox only quotes games closing within about an hour). Skipping Act 1.');
      say(`Earlier real promos can still be verified: ${bold('pnpm verify:orders <promo address>')}.`);
    } else {
      step('Pick a live Gemini game');
      ok(`${real.title} (${real.symbol}): market odds ${Math.round(Number(real.yesAsk) * 100)}%, final ${real.closesAt ?? 'n/a'}.`);
      if (real.eventId) link("The market on Gemini's own API", geminiEvent(real.eventId));
      code('Gemini market data (read-only)', ref('engine/src/venue/gemini-public.ts', 'async getEvent'));
      const r = await runPromo(connection, health, real);

      step("Check it against Gemini's own records");
      say('Asks Gemini’s API for its order history, matches the order, and checks the Solana record stores sha256(order id).');
      const v = spawnSync('pnpm', ['-s', '--filter', '@oth/engine', 'verify:orders', r.campaign], { cwd: ROOT, encoding: 'utf8' });
      const out = `${v.stdout ?? ''}${v.stderr ?? ''}`.split('\n').filter((l) => /✓|✗|VERIFIED|MISMATCH|Gemini (position|settled)|explorer\.solana/.test(l));
      for (const l of out) say(l.trim(), false);
      report.push(...out.map((l) => wrap(l.trim(), '- ', '  ')));
      code('the cross-check', ref('engine/src/tools/verify-orders.ts', "createHash('sha256')"));
      say(`The result arrives after the final${real.closesAt ? ` (${new Date(real.closesAt).toLocaleString()})` : ''}: the engine reads Gemini’s result, settles on Solana and pays refunds.`);
      code('settle + pay after the final', ref('engine/src/settler.ts', 'this.markets.resolution('));
    }
  }

  // ---- Act 2: a full game night on a practice game
  if (!args.has('--real-only')) {
    act('Act 2 · A full game night, start to finish', 'A practice game (its protection and result are simulated) so the whole cycle runs in a minute: sale → protection → win → automatic refund. Every step is a real Solana transaction.');
    if (!practice) throw new Error('no practice game open');
    const r = await runPromo(connection, health, practice);
    const before = await usdcBalance(connection, r.customer.publicKey, health.usdcMint);

    step('The game ends: the team wins');
    await j(`${APP}/api/practice-finish`, { method: 'POST', body: JSON.stringify({ campaign: r.campaign, outcome: 'yes' }) });
    say('The shop ended its practice game as a win (a request signed by the shop’s wallet; nobody else can).');
    code('only the shop can end its practice game', ref('engine/src/server.ts', "'/campaigns/:id/practice-finish'"));
    const done = await until('settlement and refunds', () => state(r.campaign), (s) => s.campaign.status === 'settled' && s.settlement?.state === 'done', 120);
    const settled = done.events.find((e) => e.name === 'campaignSettled');
    const payout = done.events.find((e) => e.name === 'payoutEvent');
    if (settled) {
      ok('Result recorded on Solana: WON.');
      link('Settle transaction (Solana Explorer)', tx(settled.signature));
    }
    code('result can be recorded once, by the operator only', ref('programs/on_the_house/src/instructions/settle.rs', 'pub fn handler'));

    step("The customer's refund is paid automatically");
    const after = await until('the refund to land', () => usdcBalance(connection, r.customer.publicKey, health.usdcMint), (b) => b > before, 60);
    ok(`Customer balance ${formatUsd(before)} → ${formatUsd(after)}: ${bold(formatUsd(after - before))} back, with no action from the shop or the customer.`);
    if (payout) link('Refund transaction (Solana Explorer)', tx(payout.signature));
    link("Customer's tokens after the refund (Solana Explorer)", tokens(r.customer.publicKey.toBase58()));
    const claims = await j<{ claims: WalletClaim[] }>(`${ENGINE}/wallets/${r.customer.publicKey.toBase58()}/claims`);
    say(`Refund claim left: ${formatUsd(claims.claims[0]?.claimBalance ?? '0')} (used up, so it can't be paid twice).`);
    code('pays only on a win, exactly once', ref('programs/on_the_house/src/instructions/payout.rs', 'OutcomeNotYes'));
  }

  // ---- save the report
  const dir = join(ROOT, 'docs/local/proof');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `proof-${startedAt.toISOString().replace(/[:.]/g, '-')}.md`);
  writeFileSync(file, `${report.join('\n')}\n`);
  console.log(`\n${green(bold('PROOF RUN COMPLETE ✓'))}  Report: ${file}`);
}

main().catch((e) => {
  console.error(`\nPROOF RUN FAILED ✗ ${(e as Error).message}`);
  process.exit(1);
});
