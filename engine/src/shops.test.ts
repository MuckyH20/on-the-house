import { strict as assert } from 'node:assert';
import { generateKeyPairSync, sign } from 'node:crypto';
import { test } from 'node:test';
import bs58 from 'bs58';
import { shopSaveMessage } from '@oth/shared/api';
import { checkShopSave } from './shops';

function wallet() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = Buffer.from(publicKey.export({ format: 'jwk' }).x!, 'base64url');
  return { address: bs58.encode(raw), sign: (m: string) => bs58.encode(sign(null, Buffer.from(m), privateKey)) };
}

const items = [{ id: 'latte', name: 'Oat latte', price: '4500000' }];

test('the owner wallet can save its shop; others, tampered or stale saves cannot', () => {
  const owner = wallet();
  const other = wallet();
  const now = Date.now();
  const sig = owner.sign(shopSaveMessage(owner.address, 'Bean There', items, now));
  const ok = checkShopSave(owner.address, { name: 'Bean There', items, timestamp: now, signature: sig }, now);
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.profile.name, 'Bean There');

  const forged = other.sign(shopSaveMessage(owner.address, 'Bean There', items, now));
  assert.equal(checkShopSave(owner.address, { name: 'Bean There', items, timestamp: now, signature: forged }, now).ok, false, 'someone else');
  assert.equal(checkShopSave(owner.address, { name: 'Evil Cafe', items, timestamp: now, signature: sig }, now).ok, false, 'tampered name');
  assert.equal(checkShopSave(owner.address, { name: 'Bean There', items, timestamp: now, signature: sig }, now + 10 * 60_000).ok, false, 'stale');
  const free = [{ id: 'x', name: 'Free thing', price: '0' }];
  const sig0 = owner.sign(shopSaveMessage(owner.address, 'Bean There', free, now));
  assert.equal(checkShopSave(owner.address, { name: 'Bean There', items: free, timestamp: now, signature: sig0 }, now).ok, false, 'zero price');
});
