import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ladderOutcome, plainCondition, toSummary, type GeminiEvent } from './gemini-public';

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../../fixtures/gemini/${name}`, import.meta.url), 'utf8'));

test('maps a live crypto event (fixture) to a MarketSummary', () => {
  const ev = (fixture('events-active-crypto.json') as { data: GeminiEvent[] }).data[0]!;
  const c = ev.contracts[0]!;
  const m = toSummary(ev, c);
  assert.equal(m.symbol, c.instrumentSymbol);
  assert.equal(m.eventId, ev.ticker);
  assert.equal(m.status, 'open');
  assert.equal(m.outcome, null);
  assert.equal(m.yesAsk, c.prices?.bestAsk);
  assert.equal(m.source, 'gemini');
  assert.equal(m.simulated, false);
});

test('maps a settled event (fixture) to resolved + outcome', () => {
  const ev = (fixture('events-recently-settled.json') as { data: GeminiEvent[] }).data[0]!;
  const c = ev.contracts[0]!;
  const m = toSummary(ev, c);
  assert.equal(m.status, 'resolved');
  assert.equal(m.outcome, c.resolutionSide);
});

test('plain-language conditions', () => {
  const one = (title: string, label: string) => plainCondition({ title, contracts: [{} as never] }, { label });
  assert.equal(one('BTC price today at 4pm EST', '$73,500 or above'), 'BTC is $73,500 or above today at 4pm EST');
  assert.equal(one('ETH price today at 3:20pm EST', 'Up'), 'ETH is up today at 3:20pm EST');
  assert.equal(one('Will the Bears win?', 'Yes'), 'the Bears win');
});

// Real sandbox event: settled at $73,759.18, with the contract list trimmed to $74,000+ (our $73,750 strike is gone).
test('resolves a ladder contract the settled event no longer lists', () => {
  const ev = fixture('event-settled-trimmed-ladder.json') as GeminiEvent;
  assert.ok(!ev.contracts.some((c) => c.instrumentSymbol === 'GEMI-BTC2611102200-HI73750'));
  assert.equal(ladderOutcome(ev, 'GEMI-BTC2611102200-HI73750'), 'yes'); // 73,759 ≥ 73,750
  assert.equal(ladderOutcome(ev, 'GEMI-BTC2611102200-HI73500'), 'yes');
  assert.equal(ladderOutcome(ev, 'GEMI-BTC2611102200-HI73800'), 'no');
});

test('ladder fallback refuses anything it cannot be sure of', () => {
  const ev = fixture('event-settled-trimmed-ladder.json') as GeminiEvent;
  assert.equal(ladderOutcome({ ...ev, status: 'closed' }, 'GEMI-BTC2611102200-HI73750'), null); // not settled yet
  assert.equal(ladderOutcome(ev, 'GEMI-BTC2611112200-HI73750'), null); // another event's symbol
  assert.equal(ladderOutcome(ev, 'GEMI-BTC2611102200-LO73750'), null); // not an "or above" strike
  assert.equal(ladderOutcome({ ...ev, template: 'binary' }, 'GEMI-BTC2611102200-HI73750'), null);
  assert.equal(ladderOutcome({ ...ev, settlement: null }, 'GEMI-BTC2611102200-HI73750'), null);
  // The listed contracts disagree with "settlement ≥ strike" → don't guess.
  const odd = { ...ev, contracts: ev.contracts.map((c, i) => (i === 0 ? { ...c, resolutionSide: 'yes' as const } : c)) };
  assert.equal(ladderOutcome(odd, 'GEMI-BTC2611102200-HI73750'), null);
});
