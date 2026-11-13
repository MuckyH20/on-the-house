import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { sendAndConfirmTransaction, Transaction } from '@solana/web3.js';
import { z } from 'zod';
import { MAX_MARKET_SYMBOL_LEN, parseUsd } from '@oth/shared';
import { createCampaignIx } from '@oth/shared/program';
import { engineFetch, HttpError, jsonError, serverCtx } from '@/lib/server';

/**
 * Launch a campaign for the demo merchant. For the hackathon the merchant signs server-side with a demo keypair
 * (MERCHANT_KEYPAIR); the operator pays the rent and fees.
 */
export const dynamic = 'force-dynamic';

const Body = z.object({
  marketSymbol: z.string().trim().min(1).max(MAX_MARKET_SYMBOL_LEN),
  refundPct: z.number().min(1).max(100),
  maxCostPct: z.number().min(0.01).max(100),
  liabilityCapUsd: z.number().min(1).max(10_000),
  maxUnhedgedUsd: z.number().min(1).max(10_000),
  deadlineMinutes: z.number().int().min(1).max(60 * 24 * 30),
});

export async function POST(req: Request) {
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    const b = parsed.data;
    if (b.maxUnhedgedUsd > b.liabilityCapUsd) throw new HttpError(400, 'Max uncovered refunds cannot exceed the total refund cap.');
    // Sales must stop before the venue stops trading the market (else sales can't be hedged).
    const [market, info] = await Promise.all([
      engineFetch<{ closesAt: string | null; status: string }>(`/markets/${encodeURIComponent(b.marketSymbol)}`).catch(() => null),
      engineFetch<{ salesCutoffMinutes?: number }>('/health').catch(() => null),
    ]);
    let deadlineMinutes = b.deadlineMinutes;
    if (market?.closesAt) {
      const cutoff = info?.salesCutoffMinutes ?? 12;
      const minutesLeft = Math.floor((Date.parse(market.closesAt) - Date.now()) / 60_000) - cutoff;
      if (minutesLeft < 1) throw new HttpError(409, `This market stops trading in under ${cutoff} minutes — pick one that closes later.`);
      deadlineMinutes = Math.min(deadlineMinutes, minutesLeft);
    }
    const { connection, program, operator, merchant, usdcMint } = await serverCtx();
    const { ix, campaign } = await createCampaignIx(program, {
      payer: operator.publicKey,
      merchant: merchant.publicKey,
      merchantUsdc: getAssociatedTokenAddressSync(usdcMint, merchant.publicKey, true),
      usdcMint,
      params: {
        campaignId: BigInt(Date.now()),
        marketSymbol: b.marketSymbol,
        refundBps: Math.round(b.refundPct * 100),
        maxPremiumBps: Math.round(b.maxCostPct * 100),
        liabilityCap: parseUsd(b.liabilityCapUsd.toFixed(2)),
        maxUnhedged: parseUsd(b.maxUnhedgedUsd.toFixed(2)),
        salesDeadline: Math.floor(Date.now() / 1000) + deadlineMinutes * 60,
      },
    });
    const signature = await sendAndConfirmTransaction(connection, new Transaction().add(ix), [operator, merchant], { commitment: 'confirmed' });
    // Make sure the engine knows about it right away (it would also pick it up from the event stream).
    await engineFetch(`/campaigns/${campaign.toBase58()}/state`).catch(() => null);
    return Response.json({ campaign: campaign.toBase58(), signature, deadlineMinutes });
  } catch (e) {
    return jsonError(e);
  }
}
