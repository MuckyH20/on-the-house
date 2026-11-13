import { createPrivateKey, sign } from 'node:crypto';
import bs58 from 'bs58';
import { z } from 'zod';
import { orderStatusMessage, type ShopOrder } from '@oth/shared/api';
import { engineFetch, HttpError, jsonError, serverCtx } from '@/lib/server';

/** Demo shop only (no Privy): the server signs order-status changes for the demo merchant wallet. */
export const dynamic = 'force-dynamic';

const Body = z.object({ signature: z.string().min(60).max(100), status: z.enum(['new', 'ready', 'done']) });

export async function PUT(req: Request) {
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, 'signature and status required');
    const { merchant } = await serverCtx();
    const timestamp = Date.now();
    const message = orderStatusMessage(merchant.publicKey.toBase58(), parsed.data.signature, parsed.data.status, timestamp);
    const pkcs8 = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.from(merchant.secretKey.slice(0, 32))]);
    const sig = bs58.encode(sign(null, Buffer.from(message, 'utf8'), createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' })));
    const order = await engineFetch<ShopOrder>(`/orders/${parsed.data.signature}/status`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: parsed.data.status, timestamp, signature: sig }),
    });
    return Response.json(order);
  } catch (e) {
    return jsonError(e);
  }
}
