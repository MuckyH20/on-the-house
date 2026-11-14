import { createHmac, timingSafeEqual } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

/**
 * QuickNode Streams webhook support.
 * Docs: https://www.quicknode.com/docs/streams (webhook destinations, validating webhooks, Solana data sources).
 *
 * Every delivery carries X-QN-Nonce, X-QN-Timestamp and X-QN-Signature, where
 *   signature = hex(HMAC-SHA256(securityToken, nonce + timestamp + payload))
 * and `payload` is the decoded (gunzipped, if Content-Encoding: gzip) JSON body as a UTF-8 string.
 */

export type VerifyResult = { ok: true } | { ok: false; reason: string };

/** Deliveries older/newer than this are refused (replay window). */
export const MAX_SKEW_SECONDS = 300;

export class NonceCache {
  private readonly seen = new Map<string, number>();
  constructor(private readonly ttlMs = MAX_SKEW_SECONDS * 2 * 1000) {}
  /** True if the nonce is new (and records it). */
  remember(nonce: string, now = Date.now()): boolean {
    for (const [n, at] of this.seen) {
      if (now - at > this.ttlMs) this.seen.delete(n);
      else break; // insertion-ordered: the rest are newer
    }
    if (this.seen.has(nonce)) return false;
    this.seen.set(nonce, now);
    return true;
  }
}

export function decodeBody(raw: Buffer, contentEncoding: string | undefined): string {
  return (contentEncoding ?? '').toLowerCase().includes('gzip') ? gunzipSync(raw).toString('utf8') : raw.toString('utf8');
}

export function signPayload(token: string, nonce: string, timestamp: string, payload: string): string {
  return createHmac('sha256', Buffer.from(token)).update(Buffer.from(nonce + timestamp + payload)).digest('hex');
}

export function verifyQuickNode(p: {
  token: string;
  nonce: string | undefined;
  timestamp: string | undefined;
  signature: string | undefined;
  payload: string;
  nonces?: NonceCache;
  nowSeconds?: number;
}): VerifyResult {
  const { token, nonce, timestamp, signature, payload } = p;
  if (!nonce || !timestamp || !signature) return { ok: false, reason: 'missing X-QN-Nonce / X-QN-Timestamp / X-QN-Signature' };
  const expected = signPayload(token, nonce, timestamp, payload);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature.trim().toLowerCase(), 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: 'bad signature' };
  const ts = Number(timestamp);
  const now = p.nowSeconds ?? Math.floor(Date.now() / 1000);
  // Timestamps may be seconds or milliseconds; normalize before checking the replay window.
  const tsSec = ts > 1e12 ? Math.floor(ts / 1000) : ts;
  if (!Number.isFinite(tsSec) || Math.abs(now - tsSec) > MAX_SKEW_SECONDS) return { ok: false, reason: 'stale timestamp' };
  if (p.nonces && !p.nonces.remember(nonce)) return { ok: false, reason: 'replayed nonce' };
  return { ok: true };
}

export interface StreamTx {
  signature: string;
  slot: number;
  blockTime: number | null;
  logs: string[];
}

/**
 * Transactions from a delivery. Our filter (engine/quicknode/filter.js) returns `{ programId, transactions }`;
 * we also accept the raw programs_with_logs shape (`{ data: [[tx…]…] }`) in case the stream runs without a filter.
 */
export function extractTransactions(body: unknown): StreamTx[] {
  const out: StreamTx[] = [];
  const visit = (v: unknown, depth: number) => {
    if (depth > 4 || v == null) return;
    if (Array.isArray(v)) {
      for (const x of v) visit(x, depth + 1);
      return;
    }
    if (typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    if (typeof o.signature === 'string' && Array.isArray(o.logs)) {
      if (o.success === false) return;
      out.push({
        signature: o.signature,
        slot: Number(o.slot ?? 0),
        blockTime: o.blockTime == null ? null : Number(o.blockTime),
        logs: (o.logs as unknown[]).filter((l): l is string => typeof l === 'string'),
      });
      return;
    }
    for (const key of ['transactions', 'data', 'matches']) if (key in o) visit(o[key], depth + 1);
  };
  visit(body, 0);
  return out;
}
