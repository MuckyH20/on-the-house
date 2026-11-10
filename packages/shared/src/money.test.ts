import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  contractsToCover,
  coverageBps,
  floorToTick,
  formatBps,
  formatUsd,
  maxHedgePriceMicros,
  maxPremiumFor,
  microsToPrice,
  parseUsd,
  premiumBpsFor,
  priceToMicros,
  quoteSale,
  rawPremiumFor,
  refundFor,
  unhedgedLiability,
} from './money';

describe('money math (mirrors on-chain purchase)', () => {
  it('refund = amount × refund_bps / 10_000, floored', () => {
    assert.equal(refundFor(4_500_000n, 10_000), 4_500_000n);
    assert.equal(refundFor(3_450_000n, 5_000), 1_725_000n);
    assert.equal(refundFor(1n, 5_000), 0n);
  });

  it('premium cap = amount × max_premium_bps / 10_000, floored', () => {
    assert.equal(maxPremiumFor(1_000_000n, 3_000), 300_000n);
    assert.equal(maxPremiumFor(333_333n, 3_000), 99_999n);
  });

  it('hedge target = ceil(liability / 1e6)', () => {
    assert.equal(contractsToCover(0n), 0n);
    assert.equal(contractsToCover(1n), 1n);
    assert.equal(contractsToCover(1_000_000n), 1n);
    assert.equal(contractsToCover(1_000_001n), 2n);
    assert.equal(contractsToCover(12_500_000n), 13n);
  });

  it('unhedged exposure saturates at zero; coverage caps at 100%', () => {
    assert.equal(unhedgedLiability(2_500_000n, 2n), 500_000n);
    assert.equal(unhedgedLiability(2_500_000n, 3n), 0n);
    assert.equal(coverageBps(0n, 0n), 10_000);
    assert.equal(coverageBps(2_000_000n, 1n), 5_000);
    assert.equal(coverageBps(2_000_000n, 5n), 10_000);
  });

  it('premium = amount × refund × ask × (1 + margin)', () => {
    // $4.00 sale, 100% refund, ask $0.25, 10% margin => 4 × 1 × 0.25 × 1.1 = $1.10
    assert.equal(rawPremiumFor(4_000_000n, 10_000, 250_000n, 1_000), 1_100_000n);
    assert.equal(premiumBpsFor(10_000, 250_000n, 1_000), 2_750);
    // 50% refund, ask 0.33, margin 10% => 0.5 × 0.33 × 1.1 = 18.15% -> ceil 1815 bps
    assert.equal(premiumBpsFor(5_000, 330_000n, 1_000), 1_815);
  });

  it('max hedge price keeps the sale within the merchant cap', () => {
    // max 30% per sale, 100% refund, 10% margin -> p ≤ 0.3 / 1.1 = 0.272727
    assert.equal(maxHedgePriceMicros(3_000, 10_000, 1_000), 272_727n);
    assert.equal(floorToTick(272_727n, 10_000n), 270_000n);
    // can never exceed $1
    assert.equal(maxHedgePriceMicros(10_000, 1_000, 0), 1_000_000n);
  });

  it('quoteSale never exceeds the on-chain cap when within the price limit', () => {
    const q = quoteSale({ amount: 3_330_000n, refundBps: 10_000, maxPremiumBps: 3_000, askMicros: 272_727n, platformMarginBps: 1_000 });
    assert.equal(q.withinCap, true);
    assert.ok(q.premium <= q.maxPremium);
    const over = quoteSale({ amount: 1_000_000n, refundBps: 10_000, maxPremiumBps: 3_000, askMicros: 300_000n, platformMarginBps: 1_000 });
    assert.equal(over.withinCap, false);
  });

  it('formats and parses dollars without crypto units', () => {
    assert.equal(formatUsd(1_000_000n), '$1.00');
    assert.equal(formatUsd(1_725_000n), '$1.725');
    assert.equal(formatUsd(1_234_567_000_000n), '$1,234,567.00');
    assert.equal(parseUsd('4.50'), 4_500_000n);
    assert.equal(parseUsd('$1,000'), 1_000_000_000n);
    assert.throws(() => parseUsd('1.2345678'));
    assert.equal(priceToMicros('0.27'), 270_000n);
    assert.equal(microsToPrice(270_000n), '0.27');
    assert.equal(formatBps(2_500), '25%');
    assert.equal(formatBps(1_250), '12.5%');
  });
});
