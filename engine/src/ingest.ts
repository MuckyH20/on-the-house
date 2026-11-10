import type { Logger } from 'pino';
import type { StoredEvent } from '@oth/shared/api';
import { decodeEvents } from '@oth/shared/program';
import type { Repo } from './db';
import type { Chain } from './solana';

export type EventHandler = (e: StoredEvent) => void | Promise<void>;

/**
 * One ingest pipeline, fed by any of:
 *  - websocket `onLogs(programId)` (INGEST_MODE=poll, plus a periodic `getSignaturesForAddress` backfill because
 *    devnet websockets drop messages), or
 *  - the QuickNode Streams webhook (INGEST_MODE=quicknode), which calls `ingestLogs` directly.
 * Idempotent: events are keyed by (signature, event index); duplicates are ignored.
 */
export class Ingest {
  private subscription: number | null = null;
  private backfillTimer: NodeJS.Timeout | null = null;
  private backfilling = false;

  constructor(
    private readonly chain: Chain,
    private readonly repo: Repo,
    private readonly log: Logger,
    private readonly onEvent: EventHandler,
  ) {}

  /** Decode and store every event in a transaction's logs. Returns the number of new events. */
  async ingestLogs(p: { signature: string; slot: number; logs: string[]; blockTime: number | null; source: StoredEvent['source'] }): Promise<number> {
    let fresh = 0;
    let events;
    try {
      events = decodeEvents(this.chain.programId, p.logs);
    } catch (e) {
      this.log.warn({ err: e, signature: p.signature }, 'could not decode events');
      return 0;
    }
    for (const ev of events) {
      const stored: StoredEvent = {
        signature: p.signature,
        index: ev.index,
        slot: p.slot,
        name: ev.name,
        campaign: typeof ev.data.campaign === 'string' ? ev.data.campaign : null,
        data: ev.data,
        blockTime: p.blockTime,
        source: p.source,
        receivedAt: Date.now(),
      };
      if (!this.repo.insertEvent(stored)) continue;
      fresh++;
      this.log.info({ event: ev.name, campaign: stored.campaign, signature: p.signature, source: p.source }, 'event');
      try {
        await this.onEvent(stored);
      } catch (e) {
        this.log.error({ err: e, event: ev.name, signature: p.signature }, 'event handler failed');
      }
    }
    this.repo.markSignatureProcessed(p.signature, p.slot);
    return fresh;
  }

  startWebsocket(): void {
    this.subscription = this.chain.connection.onLogs(
      this.chain.programId,
      (res, ctx) => {
        if (res.err) return;
        void this.ingestLogs({ signature: res.signature, slot: ctx.slot, logs: res.logs, blockTime: null, source: 'ws' });
      },
      'confirmed',
    );
    this.log.info({ programId: this.chain.programId.toBase58() }, 'onLogs subscription started');
  }

  startBackfill(intervalMs: number): void {
    const tick = () => {
      void this.backfill().finally(() => {
        this.backfillTimer = setTimeout(tick, intervalMs);
      });
    };
    tick();
  }

  /** Walk recent program signatures (newest first) until a fully-processed page; fetch logs for the rest. */
  async backfill(maxPages = 10): Promise<number> {
    if (this.backfilling) return 0;
    this.backfilling = true;
    let fresh = 0;
    try {
      const { connection, programId } = this.chain;
      let before: string | undefined;
      for (let page = 0; page < maxPages; page++) {
        const sigs = await connection.getSignaturesForAddress(programId, { before, limit: 200 }, 'confirmed');
        if (!sigs.length) break;
        const todo = sigs.filter((s) => !s.err && !this.repo.isSignatureProcessed(s.signature));
        // Oldest first, so events are handled in chain order.
        for (const s of todo.reverse()) {
          const tx = await connection.getTransaction(s.signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
          const logs = tx?.meta?.logMessages;
          if (!tx || !logs) continue;
          fresh += await this.ingestLogs({ signature: s.signature, slot: tx.slot, logs, blockTime: tx.blockTime ?? null, source: 'backfill' });
        }
        if (todo.length === 0 || sigs.length < 200) break;
        before = sigs[sigs.length - 1]!.signature;
      }
      if (fresh) this.log.info({ fresh }, 'backfill picked up events');
    } catch (e) {
      this.log.warn({ err: (e as Error).message }, 'backfill failed (will retry)');
    } finally {
      this.backfilling = false;
    }
    return fresh;
  }

  async stop(): Promise<void> {
    if (this.backfillTimer) clearTimeout(this.backfillTimer);
    if (this.subscription !== null) await this.chain.connection.removeOnLogsListener(this.subscription).catch(() => {});
  }
}
