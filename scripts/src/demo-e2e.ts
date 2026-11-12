/**
 * End-to-end demo against devnet (or a local validator) with SIMULATED Gemini. Needs a running engine.
 *   1. Campaign A: 3 purchases from 3 fresh burner wallets → wait for 100% coverage → resolve YES →
 *      assert each wallet got exactly its refund and its claims were burned.
 *   2. Campaign B: 2 purchases → resolve NO → assert no refunds were paid (claims stay, worthless).
 *
 * Usage: pnpm dev:engine   (other terminal)   then   pnpm demo:e2e
 */
import { strict as assert } from 'node:assert';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToCheckedInstruction,
} from '@solana/spl-token';
import { Keypair, PublicKey, Transaction, type TransactionInstruction } from '@solana/web3.js';
import { formatUsd, parseUsd, USDC_DECIMALS, wsUrlFor } from '@oth/shared';
import type { CampaignState, EngineInfo, Quote } from '@oth/shared/api';
import { findRepoRoot, loadDotEnv, loadKeypair } from '@oth/shared/node';
import { ata, claimAta, createCampaignIx, getProgram, purchaseIx, type CampaignRefs } from '@oth/shared/program';
import { connect, send } from './lib/solana';

process.chdir(findRepoRoot());
loadDotEnv(process.env.ENV_FILE || '.env');
const ENGINE = (process.env.PUBLIC_ENGINE_URL || 'http://localhost:8787').replace(/\/$/, '');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${ENGINE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(process.env.MOCK_ADMIN_TOKEN ? { authorization: `Bearer ${process.env.MOCK_ADMIN_TOKEN}` } : {}),
      ...init?.headers,
    },
  });
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${path} → ${res.status}: ${body.error ?? JSON.stringify(body)}`);
  return body;
}

async function waitFor<T>(label: string, fn: () => Promise<T | null | undefined | false>, timeoutMs = 120_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  process.stdout.write(`  waiting: ${label}… `);
  while (Date.now() < deadline) {
    const v = await fn().catch(() => null);
    if (v) {
      console.log('ok');
      return v;
    }
    await sleep(1_000);
  }
  console.log('TIMEOUT');
  throw new Error(`timed out waiting for ${label}`);
}

async function main() {
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const { connection, cluster } = await connect(rpcUrl, process.env.SOLANA_WS_URL || wsUrlFor(rpcUrl));
  const info = await api<EngineInfo>('/health').catch((e) => {
    throw new Error(`engine not reachable at ${ENGINE} (${(e as Error).message}). Start it with \`pnpm dev:engine\`.`);
  });
  assert.equal(info.simulated.gemini && info.simulated.resolution, true, 'demo:e2e expects GEMINI_MODE=mock and RESOLUTION_SOURCE=mock');
  const operator = loadKeypair(process.env.OPERATOR_KEYPAIR || '.keys/operator.json', 'operator');
  const merchant = loadKeypair(process.env.MERCHANT_KEYPAIR || '.keys/merchant.json', 'merchant');
  assert.equal(info.operator, operator.publicKey.toBase58(), 'engine operator differs from OPERATOR_KEYPAIR');
  const program = getProgram(connection, new PublicKey(info.programId));
  const usdcMint = new PublicKey(info.usdcMint);
  const treasury = new PublicKey(info.treasury);
  console.log(`cluster ${cluster} · engine ${ENGINE} · program ${info.programId} · SIMULATED Gemini`);

  /** Token balance; 0 only when the account doesn't exist. Rate-limit/transport errors are retried, never read as 0. */
  async function tokenBalance(account: PublicKey): Promise<bigint> {
    for (let attempt = 1; ; attempt++) {
      try {
        return BigInt((await connection.getTokenAccountBalance(account, 'confirmed')).value.amount);
      } catch (e) {
        const msg = (e as Error).message;
        if (/could not find account|Invalid param/i.test(msg)) return 0n;
        if (attempt >= 8) throw e;
        await sleep(1_000 * attempt);
      }
    }
  }
  const usdcBalance = (owner: PublicKey) => tokenBalance(ata(owner, usdcMint));
  const claimBalance = (owner: PublicKey, claimMint: PublicKey) => tokenBalance(claimAta(owner, claimMint));

  /** Fresh burner wallets with $10 dUSDC each (operator pays every fee; burners hold zero SOL). */
  async function burners(n: number): Promise<Keypair[]> {
    const ks = Array.from({ length: n }, () => Keypair.generate());
    const ixs: TransactionInstruction[] = [];
    for (const k of ks) {
      const acct = ata(k.publicKey, usdcMint);
      ixs.push(createAssociatedTokenAccountIdempotentInstruction(operator.publicKey, acct, k.publicKey, usdcMint));
      ixs.push(createMintToCheckedInstruction(usdcMint, acct, operator.publicKey, parseUsd('10'), USDC_DECIMALS));
    }
    await send(connection, new Transaction().add(...ixs), [operator]);
    return ks;
  }

  async function createCampaign(symbol: string): Promise<CampaignRefs & { address: string }> {
    const campaignId = BigInt(Date.now());
    const { ix, campaign, claimMint, refundVault } = await createCampaignIx(program, {
      payer: operator.publicKey,
      merchant: merchant.publicKey,
      merchantUsdc: ata(merchant.publicKey, usdcMint),
      usdcMint,
      params: {
        campaignId,
        marketSymbol: symbol,
        refundBps: 5_000, // 50% back
        maxPremiumBps: 2_000, // shop pays at most 20% of each sale
        liabilityCap: parseUsd('100'),
        maxUnhedged: parseUsd('3'),
        salesDeadline: Math.floor(Date.now() / 1000) + 3600,
      },
    });
    await send(connection, new Transaction().add(ix), [operator, merchant]);
    console.log(`  campaign ${campaign.toBase58()} on ${symbol}`);
    return { address: campaign.toBase58(), campaign, claimMint, refundVault, merchantUsdc: ata(merchant.publicKey, usdcMint) };
  }

  async function buy(c: CampaignRefs & { address: string }, customer: Keypair, amount: bigint) {
    const q = await api<Quote>(`/quote/${c.address}?amount=${amount}`);
    assert.ok(q.available, `quote unavailable: ${q.reason}`);
    const ix = await purchaseIx(program, {
      operator: operator.publicKey,
      customer: customer.publicKey,
      campaign: c,
      usdcMint,
      treasury,
      amount,
      premium: BigInt(q.premium!),
    });
    const sig = await send(connection, new Transaction().add(ix), [operator, customer]);
    console.log(`  ${customer.publicKey.toBase58().slice(0, 6)}… paid ${formatUsd(amount)} (premium ${formatUsd(q.premium!)}, refund if YES ${formatUsd(q.refund!)}) ${sig.slice(0, 12)}…`);
    await api(`/campaigns/${c.address}/kick`, { method: 'POST', body: '{}' }).catch(() => {});
    return { refund: BigInt(q.refund!), premium: BigInt(q.premium!) };
  }

  const state = (c: { address: string }) => api<CampaignState>(`/campaigns/${c.address}/state`);
  const waitCovered = (c: { address: string }) =>
    waitFor('100% coverage', async () => {
      const s = await state(c);
      return s.coverageBps >= 10_000 && s.hedger.pendingContracts === 0 && BigInt(s.campaign.liability) > 0n && s;
    });

  // ---------------- Campaign A: YES ----------------
  console.log('\n[A] YES path');
  const symA = `SIM-E2E-YES-${Date.now()}`;
  const A = await createCampaign(symA);
  await waitFor('engine sees campaign A', async () => (await state(A)).campaign.address === A.address);
  const walletsA = await burners(3);
  const amountsA = [parseUsd('3'), parseUsd('4.50'), parseUsd('2')];
  const refundsA: bigint[] = [];
  for (let i = 0; i < 3; i++) {
    refundsA.push((await buy(A, walletsA[i]!, amountsA[i]!)).refund);
    await waitCovered(A); // keeps unhedged exposure under max_unhedged for the next sale
  }
  const sA = await state(A);
  const liabilityA = refundsA.reduce((s, r) => s + r, 0n);
  assert.equal(BigInt(sA.campaign.liability), liabilityA, 'on-chain liability = sum of refunds');
  assert.ok(sA.fills.length > 0 && sA.fills.every((f) => f.status === 'recorded' && f.recordTx), 'every fill recorded on-chain');
  console.log(`  promised ${formatUsd(sA.promised)} · covered ${formatUsd(sA.covered)} · fills ${sA.fills.map((f) => `${f.contracts}@${f.priceMicros}`).join(', ')}`);

  const beforeA = await Promise.all(walletsA.map((w) => usdcBalance(w.publicKey)));
  await api(`/mock/markets/${encodeURIComponent(symA)}/resolve`, { method: 'POST', body: JSON.stringify({ outcome: 'yes' }) });
  console.log('  market resolved YES (SIMULATED)');
  await waitFor('settlement + payouts', async () => {
    const s = await state(A);
    return s.campaign.status === 'settled' && s.settlement.state === 'done' && s;
  });
  for (let i = 0; i < 3; i++) {
    const w = walletsA[i]!.publicKey;
    const got = (await usdcBalance(w)) - beforeA[i]!;
    assert.equal(got, refundsA[i], `wallet ${i} refund`);
    assert.equal(await claimBalance(w, A.claimMint), 0n, `wallet ${i} claims burned`);
    console.log(`  ✓ wallet ${i + 1} got ${formatUsd(got)} back; claims burned`);
  }
  const vault = BigInt((await connection.getTokenAccountBalance(A.refundVault, 'confirmed')).value.amount);
  assert.equal(vault, 0n, 'refund vault fully paid out');

  // ---------------- Campaign B: NO ----------------
  console.log('\n[B] NO path');
  const symB = `SIM-E2E-NO-${Date.now()}`;
  const B = await createCampaign(symB);
  await waitFor('engine sees campaign B', async () => (await state(B)).campaign.address === B.address);
  const walletsB = await burners(2);
  const refundsB: bigint[] = [];
  for (const [i, amt] of [parseUsd('5'), parseUsd('1')].entries()) {
    refundsB.push((await buy(B, walletsB[i]!, amt)).refund);
    await waitCovered(B);
  }
  const beforeB = await Promise.all(walletsB.map((w) => usdcBalance(w.publicKey)));
  await api(`/mock/markets/${encodeURIComponent(symB)}/resolve`, { method: 'POST', body: JSON.stringify({ outcome: 'no' }) });
  console.log('  market resolved NO (SIMULATED)');
  await waitFor('settled NO', async () => {
    const s = await state(B);
    return s.campaign.status === 'settled' && s.campaign.outcome === 'no' && s;
  });
  await sleep(3_000); // give a (wrong) payout a chance to show up before asserting it didn't
  for (let i = 0; i < 2; i++) {
    const w = walletsB[i]!.publicKey;
    assert.equal(await usdcBalance(w), beforeB[i], `wallet ${i} received nothing`);
    assert.equal(await claimBalance(w, B.claimMint), refundsB[i], `wallet ${i} claims untouched (worthless)`);
    console.log(`  ✓ wallet ${i + 1} received nothing; claim of ${formatUsd(refundsB[i]!)} is worthless`);
  }
  const sB = await state(B);
  assert.equal(sB.campaign.totalPaidOut, '0', 'no payouts on NO');

  console.log('\nE2E PASSED ✅');
  process.exit(0);
}

main().catch((e) => {
  console.error(`\nE2E FAILED ❌ ${(e as Error).stack ?? e}`);
  process.exit(1);
});

