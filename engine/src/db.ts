import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { FillStatus, HedgeFill, StoredEvent } from '@oth/shared/api';
import type { OthEventName } from '@oth/shared/program';

/**
 * Thin repository over SQLite (built-in `node:sqlite`, no native addon). Everything the engine persists goes
 * through this class, so swapping in Postgres means re-implementing these methods only.
 */
export class Repo {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS events (
        signature TEXT NOT NULL, idx INTEGER NOT NULL, slot INTEGER NOT NULL, name TEXT NOT NULL,
        campaign TEXT, data TEXT NOT NULL, block_time INTEGER, source TEXT NOT NULL, received_at INTEGER NOT NULL,
        PRIMARY KEY (signature, idx)
      );
      CREATE INDEX IF NOT EXISTS events_campaign ON events (campaign, slot);
      CREATE TABLE IF NOT EXISTS processed_signatures (signature TEXT PRIMARY KEY, slot INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS fills (
        id TEXT PRIMARY KEY, campaign TEXT NOT NULL, order_id TEXT NOT NULL, client_order_id TEXT NOT NULL,
        symbol TEXT NOT NULL, contracts INTEGER NOT NULL, price_micros TEXT NOT NULL, record_tx TEXT,
        status TEXT NOT NULL, simulated INTEGER NOT NULL, error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS fills_campaign ON fills (campaign, created_at);
      CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
  }

  // ---- events ----

  /** Returns false when the (signature, index) pair was already stored — the idempotency key. */
  insertEvent(e: StoredEvent): boolean {
    const res = this.db
      .prepare(
        `INSERT OR IGNORE INTO events (signature, idx, slot, name, campaign, data, block_time, source, received_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(e.signature, e.index, e.slot, e.name, e.campaign, JSON.stringify(e.data), e.blockTime, e.source, e.receivedAt);
    return Number(res.changes) > 0;
  }

  eventsForCampaign(campaign: string, limit = 200): StoredEvent[] {
    return this.db
      .prepare(`SELECT * FROM events WHERE campaign = ? ORDER BY slot DESC, signature, idx DESC LIMIT ?`)
      .all(campaign, limit)
      .map(rowToEvent);
  }

  eventsByName(name: OthEventName, campaign?: string): StoredEvent[] {
    const rows = campaign
      ? this.db.prepare(`SELECT * FROM events WHERE name = ? AND campaign = ? ORDER BY slot`).all(name, campaign)
      : this.db.prepare(`SELECT * FROM events WHERE name = ? ORDER BY slot`).all(name);
    return rows.map(rowToEvent);
  }

  /** Purchase/payout events that mention a wallet (buyer or customer field). */
  eventsForWallet(wallet: string): StoredEvent[] {
    return this.db
      .prepare(
        `SELECT * FROM events WHERE name IN ('purchaseEvent','payoutEvent','claimsClosed')
           AND (json_extract(data, '$.buyer') = ? OR json_extract(data, '$.customer') = ?) ORDER BY slot`,
      )
      .all(wallet, wallet)
      .map(rowToEvent);
  }

  isSignatureProcessed(signature: string): boolean {
    return !!this.db.prepare(`SELECT 1 FROM processed_signatures WHERE signature = ?`).get(signature);
  }

  markSignatureProcessed(signature: string, slot: number): void {
    this.db.prepare(`INSERT OR IGNORE INTO processed_signatures (signature, slot) VALUES (?, ?)`).run(signature, slot);
  }

  // ---- fills ----

  insertFill(f: HedgeFill): void {
    this.db
      .prepare(
        `INSERT INTO fills (id, campaign, order_id, client_order_id, symbol, contracts, price_micros, record_tx, status,
           simulated, error, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(f.id, f.campaign, f.orderId, f.clientOrderId, f.symbol, f.contracts, f.priceMicros, f.recordTx, f.status,
        f.simulated ? 1 : 0, f.error, f.createdAt, f.updatedAt);
  }

  updateFill(id: string, patch: Partial<Pick<HedgeFill, 'status' | 'recordTx' | 'error' | 'orderId' | 'contracts' | 'priceMicros'>>): void {
    const cur = this.getFill(id);
    if (!cur) throw new Error(`fill ${id} not found`);
    const next = { ...cur, ...patch, updatedAt: Date.now() };
    this.db
      .prepare(`UPDATE fills SET status = ?, record_tx = ?, error = ?, order_id = ?, contracts = ?, price_micros = ?, updated_at = ? WHERE id = ?`)
      .run(next.status, next.recordTx, next.error, next.orderId, next.contracts, next.priceMicros, next.updatedAt, id);
  }

  getFill(id: string): HedgeFill | null {
    const row = this.db.prepare(`SELECT * FROM fills WHERE id = ?`).get(id);
    return row ? rowToFill(row) : null;
  }

  fillsForCampaign(campaign: string): HedgeFill[] {
    return this.db.prepare(`SELECT * FROM fills WHERE campaign = ? ORDER BY created_at DESC`).all(campaign).map(rowToFill);
  }

  fillsWithStatus(...statuses: FillStatus[]): HedgeFill[] {
    const q = `SELECT * FROM fills WHERE status IN (${statuses.map(() => '?').join(',')}) ORDER BY created_at`;
    return this.db.prepare(q).all(...statuses).map(rowToFill);
  }

  // ---- key/value (small engine state such as "paused by hedger") ----

  getKv<T>(key: string): T | null {
    const row = this.db.prepare(`SELECT value FROM kv WHERE key = ?`).get(key) as { value: string } | undefined;
    return row ? (JSON.parse(row.value) as T) : null;
  }

  setKv(key: string, value: unknown): void {
    this.db.prepare(`INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, JSON.stringify(value));
  }

  close(): void {
    this.db.close();
  }
}

type Row = Record<string, unknown>;

function rowToEvent(r: Row): StoredEvent {
  return {
    signature: String(r.signature),
    index: Number(r.idx),
    slot: Number(r.slot),
    name: String(r.name) as OthEventName,
    campaign: r.campaign == null ? null : String(r.campaign),
    data: JSON.parse(String(r.data)) as StoredEvent['data'],
    blockTime: r.block_time == null ? null : Number(r.block_time),
    source: String(r.source) as StoredEvent['source'],
    receivedAt: Number(r.received_at),
  };
}

function rowToFill(r: Row): HedgeFill {
  return {
    id: String(r.id),
    campaign: String(r.campaign),
    orderId: String(r.order_id),
    clientOrderId: String(r.client_order_id),
    symbol: String(r.symbol),
    contracts: Number(r.contracts),
    priceMicros: String(r.price_micros),
    recordTx: r.record_tx == null ? null : String(r.record_tx),
    status: String(r.status) as FillStatus,
    simulated: Number(r.simulated) === 1,
    error: r.error == null ? null : String(r.error),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}
