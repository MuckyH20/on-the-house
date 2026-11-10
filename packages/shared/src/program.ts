import { BN, BorshCoder, EventParser, Program, type Provider } from '@anchor-lang/core';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import {
  type Connection,
  type Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  type TransactionInstruction,
} from '@solana/web3.js';
import idlJson from './idl/on_the_house.json';
import type { OnTheHouse } from './idl/on_the_house';
import { findCampaignPda, findClaimMintPda, findConfigPda, findRefundVaultPda } from './pda';

/**
 * Typed client for the on_the_house program, shared by the engine, the web app's API routes and the
 * scripts. Builders use `accountsStrict` (every account passed explicitly) so no RPC lookups happen
 * while building an instruction.
 */

export type OthProgram = Program<OnTheHouse>;
export const IDL = idlJson as OnTheHouse;
export const BPF_LOADER_UPGRADEABLE_ID = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');

export function getProgram(connection: Connection, programId?: PublicKey | string): OthProgram {
  const idl = programId ? ({ ...IDL, address: new PublicKey(programId).toBase58() } as OnTheHouse) : IDL;
  const provider: Provider = { connection };
  return new Program<OnTheHouse>(idl, provider);
}

const bn = (v: bigint | number | string) => new BN(v.toString());

export function programDataAddress(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([programId.toBytes()], BPF_LOADER_UPGRADEABLE_ID)[0];
}

export function ata(owner: PublicKey, mint: PublicKey, tokenProgram: PublicKey = TOKEN_PROGRAM_ID): PublicKey {
  return getAssociatedTokenAddressSync(mint, owner, true, tokenProgram);
}

export function claimAta(owner: PublicKey, claimMint: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(claimMint, owner, true, TOKEN_2022_PROGRAM_ID);
}

/** Addresses that identify a campaign's token plumbing. */
export interface CampaignRefs {
  campaign: PublicKey;
  merchantUsdc: PublicKey;
  claimMint: PublicKey;
  refundVault: PublicKey;
}

export function campaignAddresses(programId: PublicKey, merchant: PublicKey, campaignId: bigint | number) {
  const [campaign] = findCampaignPda(programId, merchant, campaignId);
  const [claimMint] = findClaimMintPda(programId, campaign);
  const [refundVault] = findRefundVaultPda(programId, campaign);
  return { campaign, claimMint, refundVault };
}

// ---------------------------------------------------------------------------------------------
// Instruction builders
// ---------------------------------------------------------------------------------------------

export async function initializeConfigIx(
  program: OthProgram,
  p: { admin: PublicKey; operator: PublicKey; usdcMint: PublicKey; treasury: PublicKey; usdcTokenProgram?: PublicKey },
): Promise<TransactionInstruction> {
  return program.methods
    .initializeConfig(p.operator)
    .accountsStrict({
      admin: p.admin,
      config: findConfigPda(program.programId)[0],
      usdcMint: p.usdcMint,
      treasury: p.treasury,
      program: program.programId,
      programData: programDataAddress(program.programId),
      usdcTokenProgram: p.usdcTokenProgram ?? TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

export interface CreateCampaignInput {
  campaignId: bigint;
  marketSymbol: string;
  refundBps: number;
  maxPremiumBps: number;
  liabilityCap: bigint;
  maxUnhedged: bigint;
  /** unix seconds */
  salesDeadline: number;
}

export async function createCampaignIx(
  program: OthProgram,
  p: {
    payer: PublicKey;
    merchant: PublicKey;
    merchantUsdc: PublicKey;
    usdcMint: PublicKey;
    params: CreateCampaignInput;
    usdcTokenProgram?: PublicKey;
  },
): Promise<{ ix: TransactionInstruction; campaign: PublicKey; claimMint: PublicKey; refundVault: PublicKey }> {
  const { campaign, claimMint, refundVault } = campaignAddresses(program.programId, p.merchant, p.params.campaignId);
  const ix = await program.methods
    .createCampaign({
      campaignId: bn(p.params.campaignId),
      marketSymbol: p.params.marketSymbol,
      refundBps: p.params.refundBps,
      maxPremiumBps: p.params.maxPremiumBps,
      liabilityCap: bn(p.params.liabilityCap),
      maxUnhedged: bn(p.params.maxUnhedged),
      salesDeadline: bn(p.params.salesDeadline),
    })
    .accountsStrict({
      payer: p.payer,
      merchant: p.merchant,
      config: findConfigPda(program.programId)[0],
      campaign,
      usdcMint: p.usdcMint,
      merchantUsdc: p.merchantUsdc,
      claimMint,
      refundVault,
      usdcTokenProgram: p.usdcTokenProgram ?? TOKEN_PROGRAM_ID,
      claimTokenProgram: TOKEN_2022_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  return { ix, campaign, claimMint, refundVault };
}

export async function purchaseIx(
  program: OthProgram,
  p: {
    operator: PublicKey;
    customer: PublicKey;
    campaign: CampaignRefs;
    usdcMint: PublicKey;
    treasury: PublicKey;
    amount: bigint;
    premium: bigint;
    /** Defaults to the customer's associated USDC account. */
    customerUsdc?: PublicKey;
    usdcTokenProgram?: PublicKey;
  },
): Promise<TransactionInstruction> {
  const usdcTokenProgram = p.usdcTokenProgram ?? TOKEN_PROGRAM_ID;
  return program.methods
    .purchase(bn(p.amount), bn(p.premium))
    .accountsStrict({
      operator: p.operator,
      customer: p.customer,
      config: findConfigPda(program.programId)[0],
      campaign: p.campaign.campaign,
      usdcMint: p.usdcMint,
      customerUsdc: p.customerUsdc ?? ata(p.customer, p.usdcMint, usdcTokenProgram),
      merchantUsdc: p.campaign.merchantUsdc,
      treasury: p.treasury,
      claimMint: p.campaign.claimMint,
      customerClaim: claimAta(p.customer, p.campaign.claimMint),
      usdcTokenProgram,
      claimTokenProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

export async function recordHedgeIx(
  program: OthProgram,
  p: { operator: PublicKey; campaign: PublicKey; contractsAdded: bigint; avgPriceMicros: bigint; orderRefHash: Uint8Array },
): Promise<TransactionInstruction> {
  if (p.orderRefHash.length !== 32) throw new Error('orderRefHash must be 32 bytes');
  return program.methods
    .recordHedge(bn(p.contractsAdded), bn(p.avgPriceMicros), Array.from(p.orderRefHash))
    .accountsStrict({ operator: p.operator, config: findConfigPda(program.programId)[0], campaign: p.campaign })
    .instruction();
}

export async function setPausedIx(
  program: OthProgram,
  p: { authority: PublicKey; campaign: PublicKey; paused: boolean },
): Promise<TransactionInstruction> {
  return program.methods
    .setPaused(p.paused)
    .accountsStrict({ authority: p.authority, config: findConfigPda(program.programId)[0], campaign: p.campaign })
    .instruction();
}

export type OutcomeName = 'none' | 'yes' | 'no';

export async function settleIx(
  program: OthProgram,
  p: { operator: PublicKey; campaign: PublicKey; outcome: 'yes' | 'no' },
): Promise<TransactionInstruction> {
  const outcome = p.outcome === 'yes' ? { yes: {} } : { no: {} };
  return program.methods
    .settle(outcome as never)
    .accountsStrict({ operator: p.operator, config: findConfigPda(program.programId)[0], campaign: p.campaign })
    .instruction();
}

export async function payoutIx(
  program: OthProgram,
  p: { payer: PublicKey; customer: PublicKey; campaign: CampaignRefs; usdcMint: PublicKey; usdcTokenProgram?: PublicKey },
): Promise<TransactionInstruction> {
  const usdcTokenProgram = p.usdcTokenProgram ?? TOKEN_PROGRAM_ID;
  return program.methods
    .payout()
    .accountsStrict({
      payer: p.payer,
      customer: p.customer,
      config: findConfigPda(program.programId)[0],
      campaign: p.campaign.campaign,
      usdcMint: p.usdcMint,
      claimMint: p.campaign.claimMint,
      customerClaim: claimAta(p.customer, p.campaign.claimMint),
      refundVault: p.campaign.refundVault,
      customerUsdc: ata(p.customer, p.usdcMint, usdcTokenProgram),
      usdcTokenProgram,
      claimTokenProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

export async function closeClaimsIx(
  program: OthProgram,
  p: { customer: PublicKey; campaign: PublicKey; claimMint: PublicKey },
): Promise<TransactionInstruction> {
  return program.methods
    .closeClaims()
    .accountsStrict({
      customer: p.customer,
      campaign: p.campaign,
      claimMint: p.claimMint,
      customerClaim: claimAta(p.customer, p.claimMint),
      claimTokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .instruction();
}

// ---------------------------------------------------------------------------------------------
// Account views (plain JSON-safe objects; u64 as decimal strings)
// ---------------------------------------------------------------------------------------------

export type CampaignStatusName = 'open' | 'paused' | 'settled' | 'cancelled';

export interface CampaignView {
  address: string;
  merchant: string;
  merchantUsdc: string;
  campaignId: string;
  marketSymbol: string;
  refundBps: number;
  maxPremiumBps: number;
  liabilityCap: string;
  maxUnhedged: string;
  salesDeadline: number;
  status: CampaignStatusName;
  outcome: OutcomeName;
  liability: string;
  hedgedContracts: string;
  claimMint: string;
  refundVault: string;
  totalSales: string;
  totalPremium: string;
  totalPaidOut: string;
  purchaseCount: number;
  createdAt: number;
  settledAt: number;
}

export interface ConfigView {
  address: string;
  admin: string;
  operator: string;
  treasury: string;
  usdcMint: string;
}

/** `{ open: {} }` -> "open" */
export function enumName<T extends string>(v: unknown): T {
  if (v && typeof v === 'object') {
    const key = Object.keys(v)[0];
    if (key) return key.toLowerCase() as T;
  }
  throw new Error(`Not an Anchor enum value: ${JSON.stringify(v)}`);
}

type Decoded = Record<string, unknown>;
const s = (v: unknown) => (v as { toString(): string }).toString();
const n = (v: unknown) => Number(s(v));
const pk = (v: unknown) => (v as PublicKey).toBase58();

export function toCampaignView(address: PublicKey, a: Decoded): CampaignView {
  return {
    address: address.toBase58(),
    merchant: pk(a.merchant),
    merchantUsdc: pk(a.merchantUsdc),
    campaignId: s(a.campaignId),
    marketSymbol: String(a.marketSymbol),
    refundBps: n(a.refundBps),
    maxPremiumBps: n(a.maxPremiumBps),
    liabilityCap: s(a.liabilityCap),
    maxUnhedged: s(a.maxUnhedged),
    salesDeadline: n(a.salesDeadline),
    status: enumName<CampaignStatusName>(a.status),
    outcome: enumName<OutcomeName>(a.outcome),
    liability: s(a.liability),
    hedgedContracts: s(a.hedgedContracts),
    claimMint: pk(a.claimMint),
    refundVault: pk(a.refundVault),
    totalSales: s(a.totalSales),
    totalPremium: s(a.totalPremium),
    totalPaidOut: s(a.totalPaidOut),
    purchaseCount: n(a.purchaseCount),
    createdAt: n(a.createdAt),
    settledAt: n(a.settledAt),
  };
}

export function campaignRefs(v: CampaignView): CampaignRefs {
  return {
    campaign: new PublicKey(v.address),
    merchantUsdc: new PublicKey(v.merchantUsdc),
    claimMint: new PublicKey(v.claimMint),
    refundVault: new PublicKey(v.refundVault),
  };
}

export async function fetchCampaign(program: OthProgram, address: PublicKey | string): Promise<CampaignView | null> {
  const key = new PublicKey(address);
  const a = await program.account.campaign.fetchNullable(key, 'confirmed');
  return a ? toCampaignView(key, a as unknown as Decoded) : null;
}

export async function fetchAllCampaigns(program: OthProgram): Promise<CampaignView[]> {
  const all = await program.account.campaign.all();
  return all.map((x) => toCampaignView(x.publicKey, x.account as unknown as Decoded));
}

export async function fetchConfig(program: OthProgram): Promise<ConfigView | null> {
  const key = findConfigPda(program.programId)[0];
  const a = (await program.account.config.fetchNullable(key, 'confirmed')) as unknown as Decoded | null;
  if (!a) return null;
  return {
    address: key.toBase58(),
    admin: pk(a.admin),
    operator: pk(a.operator),
    treasury: pk(a.treasury),
    usdcMint: pk(a.usdcMint),
  };
}

// ---------------------------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------------------------

export type OthEventName =
  | 'configInitialized'
  | 'configUpdated'
  | 'campaignCreated'
  | 'purchaseEvent'
  | 'hedgeRecorded'
  | 'campaignPauseChanged'
  | 'campaignSettled'
  | 'payoutEvent'
  | 'claimsClosed'
  | 'campaignCancelled';

export interface OthEvent {
  name: OthEventName;
  /** Position of this event within the transaction's logs (for idempotent dedupe with the signature). */
  index: number;
  /** Fields with u64 as decimal strings, pubkeys as base58, enums as lowercase names, byte arrays as hex. */
  data: Record<string, string | number | boolean>;
}

function normalize(value: unknown): string | number | boolean {
  if (value instanceof PublicKey) return value.toBase58();
  if (BN.isBN(value)) return (value as BN).toString();
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') return value;
  if (Array.isArray(value)) return Buffer.from(value as number[]).toString('hex');
  if (value && typeof value === 'object') return enumName<string>(value);
  return String(value);
}

const camel = (k: string) => k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/** Decode every on_the_house event in a transaction's log messages (Anchor `Program data:` logs). */
export function decodeEvents(programId: PublicKey, logs: string[]): OthEvent[] {
  const parser = new EventParser(programId, new BorshCoder(IDL));
  const out: OthEvent[] = [];
  let index = 0;
  for (const ev of parser.parseLogs(logs)) {
    const data: OthEvent['data'] = {};
    // The raw (snake_case) IDL decodes to `PurchaseEvent` / `liability_after`; expose camelCase everywhere.
    for (const [k, v] of Object.entries(ev.data as Record<string, unknown>)) data[camel(k)] = normalize(v);
    const name = (ev.name.charAt(0).toLowerCase() + ev.name.slice(1)) as OthEventName;
    out.push({ name, index: index++, data });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------------------------

/** Legacy transaction with a fresh blockhash, partially signed by `signers` (e.g. the operator as fee payer). */
export async function buildPartiallySignedTx(
  connection: Connection,
  feePayer: PublicKey,
  ixs: TransactionInstruction[],
  signers: Keypair[],
): Promise<{ tx: Transaction; blockhash: string; lastValidBlockHeight: number }> {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  const tx = new Transaction({ feePayer, blockhash, lastValidBlockHeight }).add(...ixs);
  if (signers.length) tx.partialSign(...signers);
  return { tx, blockhash, lastValidBlockHeight };
}

export { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID };
