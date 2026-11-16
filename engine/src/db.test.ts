import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { Repo } from './db';

test('a database dump merges into another host without overwriting what is there', () => {
  const old = new Repo(':memory:');
  old.saveShop({ merchant: 'A', name: 'Old name', items: [], updatedAt: 1 });
  old.saveShop({ merchant: 'B', name: 'Bean There', items: [{ id: 'x', name: 'Latte', price: '4500000' }], updatedAt: 1 });
  const dump = old.dump();

  const fresh = new Repo(':memory:');
  fresh.saveShop({ merchant: 'A', name: 'New name', items: [], updatedAt: 2 });
  const added = fresh.merge(dump);
  assert.equal(added.shops, 1); // only B was missing
  assert.equal(fresh.getShop('A')?.name, 'New name'); // the host's own row wins
  assert.equal(fresh.getShop('B')?.items[0]?.name, 'Latte');
  assert.equal(fresh.merge(dump).shops, 0); // running it twice changes nothing
});
