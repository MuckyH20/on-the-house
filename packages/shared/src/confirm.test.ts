import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { Connection } from '@solana/web3.js';
import { confirmSignature, TxError, TxExpiredError } from './confirm';

/** A fake connection: `statuses` is what each status poll returns; height rises by `step` per height read. */
function fake(statuses: (null | { confirmationStatus?: string; err?: unknown })[], startHeight: number, step: number) {
  let polls = 0;
  let height = startHeight;
  return {
    getSignatureStatuses: async () => ({ value: [statuses[Math.min(polls++, statuses.length - 1)] ?? null] }),
    getBlockHeight: async () => (height += step),
  } as unknown as Connection;
}

test('resolves once the transaction reaches the commitment', async () => {
  const c = fake([null, { confirmationStatus: 'processed' }, { confirmationStatus: 'confirmed' }], 100, 1);
  await confirmSignature(c, 'sig', 1_000, 'confirmed', 1);
});

test('a transaction that lands right at expiry is still a success (final check)', async () => {
  // polls: null (then height passes the limit) → final check sees it confirmed
  const c = fake([null, { confirmationStatus: 'finalized' }], 200, 100);
  await confirmSignature(c, 'sig', 250, 'confirmed', 1);
});

test('an on-chain failure throws TxError', async () => {
  const c = fake([{ confirmationStatus: 'confirmed', err: { InstructionError: [0, { Custom: 6016 }] } }], 100, 1);
  await assert.rejects(confirmSignature(c, 'sig', 1_000, 'confirmed', 1), TxError);
});

test('a transaction that never lands expires', async () => {
  const c = fake([null], 100, 100);
  await assert.rejects(confirmSignature(c, 'sig', 250, 'confirmed', 1), TxExpiredError);
});
