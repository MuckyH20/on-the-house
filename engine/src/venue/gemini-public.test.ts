import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { plainCondition, toSummary, type GeminiEvent } from './gemini-public';

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
