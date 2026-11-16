import { createPrivateKey, sign } from 'node:crypto';
import bs58 from 'bs58';
import { z } from 'zod';
import { shopSaveMessage, type ShopProfile } from '@oth/shared/api';
import { engineFetch, HttpError, jsonError, requireDemoAccess, serverCtx } from '@/lib/server';

/**
 * Save the DEMO shop's profile (no Privy configured): the server signs for the demo merchant wallet.
 * Privy owners sign the same message in the browser and PUT it to the engine directly.
 */
export const dynamic = 'force-dynamic';

const Body = z.object({
  name: z.string().trim().min(1).max(60),
  items: z.array(z.object({ id: z.string().min(1).max(40), name: z.string().trim().min(1).max(40), price: z.string().regex(/^\d{1,12}$/) })).min(1).max(30),
});

export async function PUT(req: Request) {
  try {
    requireDemoAccess(req);
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => i.message).join('; '));
    const { merchant } = await serverCtx();
    const address = merchant.publicKey.toBase58();
    const timestamp = Date.now();
    const message = shopSaveMessage(address, parsed.data.name, parsed.data.items, timestamp);
    // Ed25519 via Node: PKCS#8 wrapper around the 32-byte seed (first half of a Solana secret key).
    const pkcs8 = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.from(merchant.secretKey.slice(0, 32))]);
    const signature = bs58.encode(sign(null, Buffer.from(message, 'utf8'), createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' })));
    const profile = await engineFetch<ShopProfile>(`/shops/${address}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...parsed.data, timestamp, signature }),
    });
    return Response.json(profile);
  } catch (e) {
    return jsonError(e);
  }
}
