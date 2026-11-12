import { strict as assert } from 'node:assert';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import { PublicKey } from '@solana/web3.js';
import { decodeEvents, IDL } from '@oth/shared/program';
import { decodeBody, extractTransactions, NonceCache, verifyQuickNode } from './quicknode';

const token = 'test-security-token-at-least-32-characters-long';
const now = 1_794_524_415;

/** Reference implementation straight from QuickNode's guide (Node example). */
const qnSign = (nonce: string, timestamp: string, payload: string) =>
  createHmac('sha256', Buffer.from(token)).update(Buffer.from(nonce + timestamp + payload)).digest('hex');

test('accepts a correctly signed delivery; rejects tampering, stale and replayed ones', () => {
  const payload = '{"programId":"x","transactions":[]}';
  const nonce = 'n-1';
  const ts = String(now);
  const signature = qnSign(nonce, ts, payload);
  const nonces = new NonceCache();
  assert.deepEqual(verifyQuickNode({ token, nonce, timestamp: ts, signature, payload, nonces, nowSeconds: now }), { ok: true });
  assert.equal(verifyQuickNode({ token, nonce, timestamp: ts, signature, payload, nonces, nowSeconds: now }).ok, false, 'replayed nonce');
  assert.equal(verifyQuickNode({ token, nonce: 'n-2', timestamp: ts, signature, payload: payload + ' ', nowSeconds: now }).ok, false, 'tampered body');
  assert.equal(verifyQuickNode({ token: 'wrong', nonce: 'n-3', timestamp: ts, signature: qnSign('n-3', ts, payload), payload, nowSeconds: now }).ok, false, 'wrong token');
  const old = String(now - 3600);
  assert.equal(verifyQuickNode({ token, nonce: 'n-4', timestamp: old, signature: qnSign('n-4', old, payload), payload, nowSeconds: now }).ok, false, 'stale');
  const ms = String(now * 1000);
  assert.equal(verifyQuickNode({ token, nonce: 'n-5', timestamp: ms, signature: qnSign('n-5', ms, payload), payload, nowSeconds: now }).ok, true, 'ms timestamps');
  assert.equal(verifyQuickNode({ token, nonce: undefined, timestamp: ts, signature, payload }).ok, false, 'missing header');
});

test('gzip bodies are verified over the decompressed JSON', () => {
  const payload = '{"a":1}';
  assert.equal(decodeBody(gzipSync(Buffer.from(payload)), 'gzip'), payload);
  assert.equal(decodeBody(Buffer.from(payload), undefined), payload);
});

test('real QuickNode test_filter output (fixture) → transactions → our Anchor payout event', () => {
  const fixture = JSON.parse(readFileSync(new URL('../fixtures/quicknode-test-filter-payout.json', import.meta.url), 'utf8'));
  const txs = extractTransactions(fixture.result);
  assert.equal(txs.length, 1);
  assert.equal(txs[0]!.signature, '4Gh12a28ps99xowvfdY7kZEMTNNTLmSZ2FT2f9KqEwD7H4ZNoZJdnUen17zkiu4HPfmYTci3jekfLhfprxaqpBQu');
  const events = decodeEvents(new PublicKey(IDL.address), txs[0]!.logs);
  const payout = events.find((e) => e.name === 'payoutEvent');
  assert.ok(payout, `expected payoutEvent, got ${events.map((e) => e.name).join(',')}`);
  assert.equal(payout!.data.amount, '1500000');
  assert.equal(payout!.data.campaign, 'Dng3dNnPTBbv4uZaF3yNz1CJEfXCzMMThMH7zKAr6Xv3');
});

test('also accepts the raw programs_with_logs shape and skips failed transactions', () => {
  const raw = { data: [[{ signature: 'a', slot: 1, blockTime: 2, logs: ['x'], success: true }, { signature: 'b', slot: 1, logs: ['y'], success: false }]] };
  assert.deepEqual(extractTransactions(raw).map((t) => t.signature), ['a']);
});
