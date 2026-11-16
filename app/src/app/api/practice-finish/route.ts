import { z } from 'zod';
import { practiceFinishMessage } from '@oth/shared/api';
import { engineFetch, HttpError, jsonError, requireDemoAccess, serverCtx, signAsDemoMerchant } from '@/lib/server';

/** Demo shop only (no Privy): the server signs "end my practice game" for the demo merchant wallet. */
export const dynamic = 'force-dynamic';

const Body = z.object({ campaign: z.string().min(32).max(44), outcome: z.enum(['yes', 'no']) });

export async function POST(req: Request) {
  try {
    requireDemoAccess(req);
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, 'campaign and outcome required');
    const { merchant } = await serverCtx();
    const timestamp = Date.now();
    const { campaign, outcome } = parsed.data;
    const signature = signAsDemoMerchant(merchant, practiceFinishMessage(merchant.publicKey.toBase58(), campaign, outcome, timestamp));
    const res = await engineFetch<unknown>(`/campaigns/${campaign}/practice-finish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ outcome, timestamp, signature }),
    });
    return Response.json(res);
  } catch (e) {
    return jsonError(e);
  }
}
