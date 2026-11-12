import { createHash, randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import { PublicKey } from '@solana/web3.js';
import { contractsToCover, floorToTick, maxHedgePriceMicros, type EngineEnv } from '@oth/shared';
import type { HedgeFill, HedgerStatus } from '@oth/shared/api';
import { recordHedgeIx, setPausedIx, type CampaignView } from '@oth/shared/program';
import type { Repo } from './db';
import type { Registry } from './registry';
import { sendIxs, type Chain } from './solana';
import type { Venue } from './venue/types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DEFAULT_TICK = 10_000n;
/** Gemini accepts event-contract prices from $0.01 to $0.99 (a $1.00 limit is rejected with 422 Invalid price). */
export const VENUE_MAX_PRICE_MICROS = 990_000n;

/**
 * Keeps each campaign's hedged contracts ≥ ceil(liability / $1):
 *   need = target − (hedged on-chain + filled-but-not-yet-recorded)
 * buys `need` YES contracts at ≤ the campaign's max price, then records each fill on-chain with `record_hedge`.
 * If it can't fill under the max price after HEDGE_MAX_ATTEMPTS, it pauses sales on-chain (`set_paused(true)`)
 * and un-pauses once a later attempt succeeds. Work is serialized per campaign.
 */
export class Hedger {
  private readonly running = new Map<string, Promise<void>>();
  private readonly rerun = new Set<string>();
  private readonly status = new Map<string, Omit<HedgerStatus, 'pendingContracts' | 'maxPriceMicros' | 'pausedByHedger'>>();

  constructor(
    private readonly env: EngineEnv,
    private readonly chain: Chain,
    private readonly repo: Repo,
    private readonly registry: Registry,
    private readonly venue: Venue,
    private readonly log: Logger,
  ) {}

  maxPriceMicros(c: Pick<CampaignView, 'maxPremiumBps' | 'refundBps'>, tick = DEFAULT_TICK): bigint {
    const p = floorToTick(maxHedgePriceMicros(c.maxPremiumBps, c.refundBps, this.env.PLATFORM_MARGIN_BPS), tick);
    return p > VENUE_MAX_PRICE_MICROS ? VENUE_MAX_PRICE_MICROS : p;
  }

  pausedByHedger(campaign: string): boolean {
    return this.repo.getKv<boolean>(`pausedByHedger:${campaign}`) ?? false;
  }

  statusFor(c: CampaignView): HedgerStatus {
    const s = this.status.get(c.address) ?? { state: 'idle' as const, lastError: null };
    return {
      ...s,
      pendingContracts: this.pendingContracts(c.address),
      maxPriceMicros: this.maxPriceMicros(c).toString(),
      pausedByHedger: this.pausedByHedger(c.address),
    };
  }

  private setState(campaign: string, state: HedgerStatus['state'], lastError: string | null = null) {
    this.status.set(campaign, { state, lastError });
    this.registry.changed(campaign);
  }

  private pendingContracts(campaign: string): number {
    return this.repo
      .fillsForCampaign(campaign)
      .filter((f) => f.status === 'filled')
      .reduce((n, f) => n + f.contracts, 0);
  }

  /** Request a hedge pass for a campaign. Coalesces bursts: at most one running + one queued pass. */
  kick(campaign: string): void {
    if (this.running.has(campaign)) {
      this.rerun.add(campaign);
      return;
    }
    const p = this.pass(campaign)
      .catch((e) => {
        this.log.error({ err: e, campaign }, 'hedge pass crashed');
        this.setState(campaign, 'failed', (e as Error).message);
      })
      .finally(() => {
        this.running.delete(campaign);
        if (this.rerun.delete(campaign)) this.kick(campaign);
      });
    this.running.set(campaign, p);
  }

  kickAll(): void {
    for (const c of this.registry.all()) if (c.status === 'open' || c.status === 'paused') this.kick(c.address);
  }

  async idle(): Promise<void> {
    while (this.running.size) await Promise.all([...this.running.values()]);
  }

  private async pass(campaign: string): Promise<void> {
    // 1) Record any fills that traded but never made it on-chain (crash recovery).
    for (const f of this.repo.fillsForCampaign(campaign).filter((x) => x.status === 'filled').reverse()) {
      await this.record(f);
    }

    const c = await this.registry.refresh(campaign);
    if (!c || c.status === 'settled' || c.status === 'cancelled') return;

    const target = contractsToCover(BigInt(c.liability));
    const need = Number(target - BigInt(c.hedgedContracts)) - this.pendingContracts(campaign);
    if (need <= 0) {
      await this.maybeUnpause(c);
      if ((this.status.get(campaign)?.state ?? 'idle') !== 'idle') this.setState(campaign, 'idle');
      return;
    }

    const quote = await this.venue.quote(c.marketSymbol);
    const limit = this.maxPriceMicros(c, quote.tickMicros || DEFAULT_TICK);
    this.setState(campaign, 'hedging');
    let remaining = need;
    let lastReason = '';
    for (let attempt = 1; attempt <= this.env.HEDGE_MAX_ATTEMPTS && remaining > 0; attempt++) {
      const clientOrderId = `oth-${campaign.slice(0, 8)}-${Date.now()}-${attempt}`;
      const res = await this.venue.buyYes({ symbol: c.marketSymbol, contracts: remaining, limitPriceMicros: limit, clientOrderId });
      this.log.info({ campaign, attempt, contracts: remaining, limit: limit.toString(), res: { ...res, avgPriceMicros: res.avgPriceMicros.toString() } }, 'hedge order');
      if (res.filledContracts > 0) {
        const now = Date.now();
        const fill: HedgeFill = {
          id: randomUUID(),
          campaign,
          orderId: res.orderId,
          clientOrderId,
          symbol: c.marketSymbol,
          contracts: res.filledContracts,
          priceMicros: res.avgPriceMicros.toString(),
          recordTx: null,
          status: 'filled',
          simulated: this.venue.simulated,
          error: null,
          createdAt: now,
          updatedAt: now,
        };
        this.repo.insertFill(fill);
        this.registry.changed(campaign);
        remaining -= res.filledContracts;
        await this.record(fill);
      }
      if (res.state === 'open') await this.venue.cancel(res.orderId).catch(() => {});
      if (remaining > 0) {
        lastReason = res.reason ?? `only ${need - remaining}/${need} contracts filled`;
        this.setState(campaign, 'retrying', lastReason);
        await sleep(this.env.HEDGE_RETRY_BASE_MS * 2 ** (attempt - 1));
      }
    }

    if (remaining > 0) {
      this.log.warn({ campaign, remaining, reason: lastReason }, 'could not hedge under the max price — pausing sales');
      await this.pauseForHedge(c);
      this.setState(campaign, 'failed', `Couldn't buy coverage under $${(Number(limit) / 1e6).toFixed(2)}: ${lastReason}`);
      return;
    }
    const fresh = await this.registry.refresh(campaign);
    if (fresh) await this.maybeUnpause(fresh);
    this.setState(campaign, 'idle');
  }

  /** Send `record_hedge` for a fill, persisting the signature before sending so a crash can't double-record. */
  private async record(fill: HedgeFill): Promise<void> {
    const { connection } = this.chain;
    if (fill.recordTx) {
      const st = await connection.getSignatureStatus(fill.recordTx, { searchTransactionHistory: true });
      if (st.value && !st.value.err && st.value.confirmationStatus) {
        this.repo.updateFill(fill.id, { status: 'recorded' });
        this.registry.changed(fill.campaign);
        return;
      }
    }
    const orderRefHash = createHash('sha256').update(fill.orderId).digest();
    const ix = await recordHedgeIx(this.chain.program, {
      operator: this.chain.operator.publicKey,
      campaign: new PublicKey(fill.campaign),
      contractsAdded: BigInt(fill.contracts),
      avgPriceMicros: BigInt(fill.priceMicros),
      orderRefHash,
    });
    try {
      const sig = await sendIxs(this.chain, [ix], { onSigned: (s) => this.repo.updateFill(fill.id, { recordTx: s }) });
      this.repo.updateFill(fill.id, { status: 'recorded', recordTx: sig, error: null });
      this.log.info({ campaign: fill.campaign, contracts: fill.contracts, sig }, 'record_hedge confirmed');
    } catch (e) {
      // Stays `filled` (counted as pending) so the next pass retries it.
      this.repo.updateFill(fill.id, { error: (e as Error).message.slice(0, 300) });
      this.log.error({ err: (e as Error).message, fill: fill.id }, 'record_hedge failed');
    }
    this.registry.changed(fill.campaign);
  }

  private async pauseForHedge(c: CampaignView): Promise<void> {
    if (c.status !== 'open') return;
    const ix = await setPausedIx(this.chain.program, { authority: this.chain.operator.publicKey, campaign: new PublicKey(c.address), paused: true });
    await sendIxs(this.chain, [ix]);
    this.repo.setKv(`pausedByHedger:${c.address}`, true);
    await this.registry.refresh(c.address);
  }

  private async maybeUnpause(c: CampaignView): Promise<void> {
    if (!this.pausedByHedger(c.address)) return;
    if (c.status === 'paused') {
      const ix = await setPausedIx(this.chain.program, { authority: this.chain.operator.publicKey, campaign: new PublicKey(c.address), paused: false });
      await sendIxs(this.chain, [ix]);
      this.log.info({ campaign: c.address }, 'hedge caught up — sales resumed');
    }
    this.repo.setKv(`pausedByHedger:${c.address}`, false);
    await this.registry.refresh(c.address);
  }
}
