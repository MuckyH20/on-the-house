import { jsonError, serverCtx } from '@/lib/server';

/** The demo shop's wallet address (used when no Privy app is configured). */
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { merchant } = await serverCtx();
    return Response.json({ address: merchant.publicKey.toBase58() });
  } catch (e) {
    return jsonError(e);
  }
}
