import type { Logger } from 'pino';
import { PublicKey } from '@solana/web3.js';
import {
  createMintToCheckedInstruction,
  createTransferCheckedInstruction,
  getMint,
} from '@solana/spl-token';
import { USDC_DECIMALS, type EngineEnv } from '@oth/shared';
import type { SettlementStatus } from '@oth/shared/api';
import { campaignRefs, claimAta, payoutIx, settleIx, type CampaignView } from '@oth/shared/program';
import type { Repo } from './db';
import type { Registry } from './registry';
import { sendIxs, type Chain } from './solana';
import type { MarketSource } from './venue/types';

/**
 * Watches each live campaign's market resolution (RESOLUTION_SOURCE). When it resolves:
 *   1. `settle(outcome)` on-chain
 *   2. YES: fund the refund vault (demo: operator mints mock dUSDC; otherwise transfer from the treasury —
 *      in production that money is the Gemini payout), then
 *   3. `payout` every claim holder. Holders = buyers from stored PurchaseEvents ∪ token accounts of the claim mint.
 */
export class Settler {
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private readonly status = new Map<string, SettlementStatus>();
  private mintAuthorityIsOperator: boolean | null = null;

  constructor(
    private readonly env: EngineEnv,
    private readonly chain: Chain,
    private readonly repo: Repo,
    private readonly registry: Registry,
    private readonly markets: MarketSource,
    private readonly log: Logger,
  ) {}

  statusFor(c: CampaignView): SettlementStatus {
    const s = this.status.get(c.address);
    if (s) return s;
    if (c.status === 'settled') {
      // Not processed since (re)start: YES is only done once refunds paid out cover what was promised.
      const unpaid = c.outcome === 'yes' && BigInt(c.totalPaidOut) < BigInt(c.liability);
      return { state: unpaid ? 'paying' : 'done', outcome: c.outcome === 'none' ? null : c.outcome, holders: 0, paid: 0, lastError: null };
    }
    return { state: 'waiting', outcome: null, holders: 0, paid: 0, lastError: null };
  }

  private set(campaign: string, patch: Partial<SettlementStatus>) {
    const cur = this.status.get(campaign) ?? { state: 'waiting', outcome: null, holders: 0, paid: 0, lastError: null };
    this.status.set(campaign, { ...cur, ...patch });
    this.registry.changed(campaign);
  }

  start(): void {
    const loop = () => {
      void this.tick().finally(() => {
        this.timer = setTimeout(loop, this.env.SETTLER_POLL_MS);
      });
    };
    loop();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  /** One sweep over all campaigns. Safe to call any time (e.g. right after a mock resolution). */
  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      for (const c of this.registry.all()) {
        try {
          await this.process(c);
        } catch (e) {
          this.log.error({ err: (e as Error).message, campaign: c.address }, 'settlement step failed (will retry)');
          this.set(c.address, { state: 'failed', lastError: (e as Error).message.slice(0, 300) });
        }
      }
    } finally {
      this.busy = false;
    }
  }

  private async process(c: CampaignView): Promise<void> {
    if (c.status === 'cancelled') return;
    if (c.status !== 'settled') {
      const res = await this.markets.resolution(c.marketSymbol);
      if (!res.resolved) return;
      this.set(c.address, { state: 'settling', outcome: res.outcome, lastError: null });
      const ix = await settleIx(this.chain.program, { operator: this.chain.operator.publicKey, campaign: new PublicKey(c.address), outcome: res.outcome });
      const sig = await sendIxs(this.chain, [ix]);
      this.log.info({ campaign: c.address, outcome: res.outcome, sig }, 'settled');
      c = (await this.registry.refresh(c.address)) ?? c;
    }
    if (c.outcome !== 'yes') {
      if (this.status.get(c.address)?.state !== 'done') this.set(c.address, { state: 'done', outcome: c.outcome === 'no' ? 'no' : null });
      return;
    }
    if (this.status.get(c.address)?.state === 'done') return;

    const holders = await this.claimHolders(c);
    const owed = holders.reduce((s, h) => s + h.amount, 0n);
    const paidSoFar = this.repo.eventsByName('payoutEvent', c.address).length;
    this.set(c.address, { outcome: 'yes', holders: holders.length + paidSoFar, paid: paidSoFar });
    if (owed === 0n) {
      this.set(c.address, { state: 'done', lastError: null });
      return;
    }

    this.set(c.address, { state: 'funding' });
    await this.fundVault(c, owed);

    this.set(c.address, { state: 'paying' });
    const refs = campaignRefs(c);
    let paid = paidSoFar;
    for (const h of holders) {
      const ix = await payoutIx(this.chain.program, {
        payer: this.chain.operator.publicKey,
        customer: h.owner,
        campaign: refs,
        usdcMint: this.chain.usdcMint,
      });
      const sig = await sendIxs(this.chain, [ix]);
      paid++;
      this.log.info({ campaign: c.address, customer: h.owner.toBase58(), amount: h.amount.toString(), sig }, 'payout');
      this.set(c.address, { paid });
    }
    await this.registry.refresh(c.address);
    this.set(c.address, { state: 'done', lastError: null });
  }

  /**
   * Wallets with a non-zero claim balance. Public devnet RPC refuses `getProgramAccounts` on the token programs, so:
   *   candidates = buyers from stored PurchaseEvents ∪ owners of the claim mint's largest accounts
   *   (`getTokenLargestAccounts`, which catches holders an ingest gap missed), then
   *   each candidate's claim ATA is read directly (`getMultipleAccountsInfo`) for the authoritative balance.
   */
  async claimHolders(c: CampaignView): Promise<{ owner: PublicKey; amount: bigint }[]> {
    const { connection } = this.chain;
    const claimMint = new PublicKey(c.claimMint);
    const buyers = new Set(this.repo.eventsByName('purchaseEvent', c.address).map((e) => String(e.data.buyer)));
    const candidates = new Set(buyers);
    try {
      const largest = await connection.getTokenLargestAccounts(claimMint, 'confirmed');
      const accts = await connection.getMultipleAccountsInfo(largest.value.map((x) => x.address), 'confirmed');
      for (const a of accts) {
        if (!a || a.data.length < 72) continue;
        const owner = new PublicKey(a.data.subarray(32, 64)).toBase58();
        if (!buyers.has(owner)) this.log.warn({ campaign: c.address, owner }, 'claim holder without a stored PurchaseEvent (ingest gap?) — paying anyway');
        candidates.add(owner);
      }
    } catch (e) {
      this.log.warn({ err: (e as Error).message, campaign: c.address }, 'getTokenLargestAccounts failed; using stored buyers only');
    }
    const owners = [...candidates].map((o) => new PublicKey(o));
    const out: { owner: PublicKey; amount: bigint }[] = [];
    for (let i = 0; i < owners.length; i += 100) {
      const chunk = owners.slice(i, i + 100);
      const infos = await connection.getMultipleAccountsInfo(chunk.map((o) => claimAta(o, claimMint)), 'confirmed');
      infos.forEach((info, j) => {
        if (!info || info.data.length < 72) return;
        const amount = info.data.readBigUInt64LE(64);
        if (amount > 0n) out.push({ owner: chunk[j]!, amount });
      });
    }
    return out;
  }

  private async fundVault(c: CampaignView, owed: bigint): Promise<void> {
    const { connection, operator, usdcMint, treasury } = this.chain;
    const vault = new PublicKey(c.refundVault);
    const bal = BigInt((await connection.getTokenAccountBalance(vault, 'confirmed')).value.amount);
    if (bal >= owed) return;
    const shortfall = owed - bal;
    if (this.mintAuthorityIsOperator === null) {
      const mint = await getMint(connection, usdcMint, 'confirmed');
      this.mintAuthorityIsOperator = mint.mintAuthority?.equals(operator.publicKey) ?? false;
    }
    const ix = this.mintAuthorityIsOperator
      ? // Demo: mock dUSDC is minted by the operator (stands in for the Gemini YES payout).
        createMintToCheckedInstruction(usdcMint, vault, operator.publicKey, shortfall, USDC_DECIMALS)
      : createTransferCheckedInstruction(treasury, usdcMint, vault, operator.publicKey, shortfall, USDC_DECIMALS);
    const sig = await sendIxs(this.chain, [ix]);
    this.log.info({ campaign: c.address, amount: shortfall.toString(), minted: this.mintAuthorityIsOperator, sig }, 'refund vault funded');
  }
}
