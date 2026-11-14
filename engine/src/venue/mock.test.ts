import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { practiceFromSymbol } from './mock';

test('a practice game is rebuilt from its symbol (survives an engine restart)', () => {
  const m = practiceFromSymbol('SIM-PRACTICE-BTC-202611142330')!;
  assert.equal(m.title, 'BTC price today — Up');
  assert.equal(m.condition, 'Bitcoin finishes up (practice game)');
  assert.equal(m.closesAt, '2026-11-14T23:30:00.000Z');
  assert.equal(practiceFromSymbol('SIM-PRACTICE-ETH-202611142330-2')!.condition, 'Ethereum finishes up (practice game)');
  assert.equal(practiceFromSymbol('SIM-PRACTICE-DOGE-202611142330'), null);
  assert.equal(practiceFromSymbol('GEMI-BTC2611142300-HI71000'), null);
});
