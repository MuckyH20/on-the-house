/**
 * One-shot devnet setup (idempotent — safe to re-run):
 *   1. operator/admin + demo-merchant keypairs in .keys/ (gitignored), funded with devnet SOL
 *   2. mock "dUSDC" mint (6 decimals, operator = mint authority) unless USDC_MINT is already set
 *   3. treasury (operator's dUSDC account) and the merchant's dUSDC account
 *   4. deploy (or upgrade) the program from target/deploy/on_the_house.so
 *   5. initialize the config (operator = admin = upgrade authority)
 *   6. write .env (engine + scripts) and app/.env.local (web app)
 *
 * Usage: pnpm setup:devnet            (build first: pnpm program:build)
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createMint, getMint, getOrCreateAssociatedTokenAccount, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { USDC_DECIMALS } from '@oth/shared';
import { findRepoRoot, loadDotEnv, loadKeypair } from '@oth/shared/node';
import { fetchConfig, getProgram, IDL, initializeConfigIx, programDataAddress } from '@oth/shared/program';
import { updateEnvFile } from './lib/envfile';
import { connect, ensureSol, keypairJson, send, sol, SOLANA_BIN } from './lib/solana';

const ROOT = findRepoRoot();
const KEYS = join(ROOT, '.keys');
const PROGRAM_SO = join(ROOT, 'target/deploy/on_the_house.so');
const PROGRAM_KEYPAIR = join(KEYS, 'on_the_house-program-keypair.json');
const ANCHOR_PROGRAM_KEYPAIR = join(ROOT, 'target/deploy/on_the_house-keypair.json');

function ensureKeypair(path: string, label: string): Keypair {
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, keypairJson(Keypair.generate()), { mode: 0o600 });
    console.log(`created ${label} keypair: ${path}`);
  }
  chmodSync(path, 0o600);
  return loadKeypair(path, label);
}

function solanaCli(args: string[]): { ok: boolean; out: string } {
  const res = spawnSync(join(SOLANA_BIN, 'solana'), args, {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${SOLANA_BIN}:${process.env.PATH}` },
  });
  const out = `${res.stdout ?? ''}${res.stderr ?? ''}`;
  return { ok: res.status === 0, out };
}

/** True when the deployed program bytes already equal the local build. */
async function deployedMatches(connection: import('@solana/web3.js').Connection, programId: PublicKey, local: Buffer) {
  const programAcct = await connection.getAccountInfo(programId, 'confirmed');
  if (!programAcct) return { deployed: false, matches: false };
  const pd = await connection.getAccountInfo(programDataAddress(programId), 'confirmed');
  if (!pd) return { deployed: true, matches: false };
  const bytes = pd.data.subarray(45);
  const same = bytes.subarray(0, local.length).equals(local) && bytes.subarray(local.length).every((b) => b === 0);
  return { deployed: true, matches: same };
}

async function main() {
  // ENV_FILE lets a local-validator run keep its own config (e.g. ENV_FILE=.env.local-validator).
  const envFile = process.env.ENV_FILE || '.env';
  loadDotEnv(envFile);
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const { connection, cluster } = await connect(rpcUrl, process.env.SOLANA_WS_URL || undefined);
  console.log(`cluster: ${cluster} (${rpcUrl})`);

  // ---- keys ----
  const operator = ensureKeypair(join(KEYS, 'operator.json'), 'operator/admin');
  const merchant = ensureKeypair(join(KEYS, 'merchant.json'), 'demo merchant');
  if (!existsSync(PROGRAM_KEYPAIR) && existsSync(ANCHOR_PROGRAM_KEYPAIR)) copyFileSync(ANCHOR_PROGRAM_KEYPAIR, PROGRAM_KEYPAIR);
  const programKp = loadKeypair(PROGRAM_KEYPAIR, 'program');
  const programId = programKp.publicKey;
  if (programId.toBase58() !== IDL.address) {
    throw new Error(`Program keypair ${programId.toBase58()} != declare_id ${IDL.address}. Fix declare_id!/Anchor.toml and rebuild.`);
  }
  if (!existsSync(ANCHOR_PROGRAM_KEYPAIR)) {
    mkdirSync(dirname(ANCHOR_PROGRAM_KEYPAIR), { recursive: true });
    copyFileSync(PROGRAM_KEYPAIR, ANCHOR_PROGRAM_KEYPAIR);
  }
  console.log(`operator: ${operator.publicKey.toBase58()}\nmerchant: ${merchant.publicKey.toBase58()}\nprogram:  ${programId.toBase58()}`);

  // ---- SOL ----
  if (!existsSync(PROGRAM_SO)) throw new Error(`${PROGRAM_SO} missing — run \`pnpm program:build\` first.`);
  const so = readFileSync(PROGRAM_SO);
  const status = await deployedMatches(connection, programId, so);
  const rentForProgram = await connection.getMinimumBalanceForRentExemption(so.length + 45);
  // Fresh deploy or upgrade both need a full-size buffer (refunded after an upgrade) + fees.
  const needForDeploy = status.matches ? 0 : rentForProgram + (status.deployed ? rentForProgram : 0) + 0.3 * LAMPORTS_PER_SOL;
  const minOperator = Math.max(needForDeploy, 0.5 * LAMPORTS_PER_SOL);
  await ensureSol(connection, operator.publicKey, minOperator, 'operator');

  // ---- dUSDC mint ----
  let usdcMint: PublicKey;
  if (process.env.USDC_MINT) {
    usdcMint = new PublicKey(process.env.USDC_MINT);
    const m = await getMint(connection, usdcMint, 'confirmed', TOKEN_PROGRAM_ID);
    if (m.decimals !== USDC_DECIMALS) throw new Error(`USDC_MINT must have 6 decimals (has ${m.decimals})`);
    const ours = m.mintAuthority?.equals(operator.publicKey) ?? false;
    console.log(`USDC mint: ${usdcMint.toBase58()} (${ours ? 'mock dUSDC, operator is mint authority' : 'external mint — operator cannot mint'})`);
  } else {
    usdcMint = await createMint(connection, operator, operator.publicKey, null, USDC_DECIMALS, undefined, { commitment: 'confirmed' }, TOKEN_PROGRAM_ID);
    console.log(`created mock dUSDC mint: ${usdcMint.toBase58()}`);
    // Persist right away so a later failure (e.g. a rate-limited deploy) doesn't mint a second dUSDC on re-run.
    updateEnvFile(join(ROOT, envFile), { USDC_MINT: usdcMint.toBase58() });
  }

  // ---- token accounts ----
  const treasury = await getOrCreateAssociatedTokenAccount(connection, operator, usdcMint, operator.publicKey, false, 'confirmed');
  const merchantUsdc = await getOrCreateAssociatedTokenAccount(connection, operator, usdcMint, merchant.publicKey, false, 'confirmed');
  console.log(`treasury: ${treasury.address.toBase58()}\nmerchant dUSDC account: ${merchantUsdc.address.toBase58()}`);

  // A little SOL so the demo merchant can also pay its own fees if needed (the operator normally pays).
  const merchantBal = await connection.getBalance(merchant.publicKey, 'confirmed');
  if (merchantBal < 0.02 * LAMPORTS_PER_SOL) {
    await send(
      connection,
      new Transaction().add(SystemProgram.transfer({ fromPubkey: operator.publicKey, toPubkey: merchant.publicKey, lamports: 0.05 * LAMPORTS_PER_SOL })),
      [operator],
    );
    console.log('sent 0.05 SOL to the demo merchant');
  }

  // ---- deploy ----
  if (status.matches) {
    console.log('program: deployed bytes match target/deploy/on_the_house.so — skipping deploy');
  } else {
    console.log(`program: ${status.deployed ? 'upgrading' : 'deploying'} (${(so.length / 1024).toFixed(0)} KB, ~${sol(rentForProgram)} SOL rent)…`);
    const args = [
      'program', 'deploy', PROGRAM_SO,
      '--program-id', PROGRAM_KEYPAIR,
      '--keypair', join(KEYS, 'operator.json'),
      '--upgrade-authority', join(KEYS, 'operator.json'),
      '--url', rpcUrl,
      '--commitment', 'confirmed',
      // Writes go straight to validators (TPU/QUIC) by default; DEPLOY_USE_RPC=1 routes them through the RPC instead.
      ...(process.env.DEPLOY_USE_RPC === '1' ? ['--use-rpc'] : []),
      '--max-sign-attempts', '60',
    ];
    let res = solanaCli(args);
    if (!res.ok) {
      console.log(res.out.split('\n').slice(-15).join('\n'));
      console.log('deploy failed; reclaiming any half-written buffers and retrying once…');
      solanaCli(['program', 'close', '--buffers', '--keypair', join(KEYS, 'operator.json'), '--url', rpcUrl, '--bypass-warning']);
      res = solanaCli(args);
    }
    console.log(res.out.split('\n').filter(Boolean).slice(-4).join('\n'));
    if (!res.ok) throw new Error('program deploy failed (see output above)');
    // A freshly deployed/upgraded program is only invocable from a later slot.
    const deploySlot = await connection.getSlot('confirmed');
    while ((await connection.getSlot('confirmed')) < deploySlot + 2) await new Promise((r) => setTimeout(r, 400));
  }

  // ---- config ----
  const program = getProgram(connection, programId);
  const existing = await fetchConfig(program);
  if (existing) {
    const mismatches = [
      existing.operator !== operator.publicKey.toBase58() && 'operator',
      existing.usdcMint !== usdcMint.toBase58() && 'usdc mint',
      existing.treasury !== treasury.address.toBase58() && 'treasury',
    ].filter(Boolean);
    console.log(`config: already initialized${mismatches.length ? ` — WARNING: differs in ${mismatches.join(', ')}` : ''}`);
    if (existing.usdcMint !== usdcMint.toBase58()) {
      throw new Error(`Config uses USDC mint ${existing.usdcMint}; set USDC_MINT=${existing.usdcMint} in .env and re-run.`);
    }
  } else {
    const ix = await initializeConfigIx(program, {
      admin: operator.publicKey,
      operator: operator.publicKey,
      usdcMint,
      treasury: treasury.address,
    });
    const sig = await send(connection, new Transaction().add(ix), [operator]);
    console.log(`config: initialized (${sig})`);
  }

  // ---- env files ----
  const engineUrl = process.env.PUBLIC_ENGINE_URL || 'http://localhost:8787';
  updateEnvFile(
    join(ROOT, envFile),
    {
      SOLANA_RPC_URL: rpcUrl,
      PROGRAM_ID: programId.toBase58(),
      USDC_MINT: usdcMint.toBase58(),
      TREASURY_TOKEN_ACCOUNT: treasury.address.toBase58(),
    },
    {
      OPERATOR_KEYPAIR: '.keys/operator.json',
      MERCHANT_KEYPAIR: '.keys/merchant.json',
      GEMINI_MODE: 'mock',
      INGEST_MODE: 'poll',
      RESOLUTION_SOURCE: 'mock',
      PLATFORM_MARGIN_BPS: '1000',
      ENGINE_PORT: '8787',
      PUBLIC_ENGINE_URL: engineUrl,
      CORS_ORIGINS: 'http://localhost:3000',
    },
    '# Written by scripts/setup-devnet.ts — engine + scripts config. Never commit this file.',
  );
  if (envFile === '.env') updateEnvFile(
    join(ROOT, 'app/.env.local'),
    {
      SOLANA_RPC_URL: rpcUrl,
      PROGRAM_ID: programId.toBase58(),
      USDC_MINT: usdcMint.toBase58(),
      TREASURY_TOKEN_ACCOUNT: treasury.address.toBase58(),
      NEXT_PUBLIC_SOLANA_RPC_URL: rpcUrl,
      NEXT_PUBLIC_PROGRAM_ID: programId.toBase58(),
      NEXT_PUBLIC_USDC_MINT: usdcMint.toBase58(),
    },
    {
      OPERATOR_KEYPAIR: '.keys/operator.json',
      MERCHANT_KEYPAIR: '.keys/merchant.json',
      ENGINE_URL: engineUrl,
      NEXT_PUBLIC_ENGINE_URL: engineUrl,
      PLATFORM_MARGIN_BPS: '1000',
    },
    '# Written by scripts/setup-devnet.ts — web app config. Never commit this file.',
  );
  const bal = await connection.getBalance(operator.publicKey, 'confirmed');
  console.log(`\nwrote ${envFile}${envFile === '.env' ? ' and app/.env.local' : ''} · operator balance ${sol(bal)} SOL\nDone. Next: pnpm dev:engine  (then pnpm demo:e2e or pnpm dev:app)`);
}

main().catch((e) => {
  console.error(`\nsetup-devnet failed: ${(e as Error).message}`);
  process.exit(1);
});
