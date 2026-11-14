import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { hedgeLimit } from './hedger';

test('hedge limit hugs the ask (Gemini rejects limits far above it) but never exceeds the shop max', () => {
  assert.equal(hedgeLimit(900_000n, 620_000n, 10_000n), 770_000n, 'ask $0.62 → limit $0.77, not $0.90');
  assert.equal(hedgeLimit(700_000n, 620_000n, 10_000n), 700_000n, 'shop max is lower → use it');
  assert.equal(hedgeLimit(990_000n, 870_000n, 10_000n), 990_000n, 'near the cap → cap');
  assert.equal(hedgeLimit(500_000n, null, 10_000n), 500_000n, 'no ask known → shop max');
  assert.equal(hedgeLimit(990_000n, 123_000n, 10_000n), 270_000n, 'rounded down to the tick');
});
