import 'server-only';
import { createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { PublicKey, sendAndConfirmTransaction, Transaction } from '@solana/web3.js';
import { z } from 'zod';
import { MAX_MARKET_SYMBOL_LEN, parseUsd } from '@oth/shared';
import { buildPartiallySignedTx, createCampaignIx } from '@oth/shared/program';
import { engineFetch, HttpError, serverCtx } from './server';

export const LaunchBody = z.object({
  /** The owner's wallet (Privy). Omit to launch as the server's demo merchant. */
  merchant: z.string().trim().optional(),
  marketSymbol: z.string().trim().min(1).max(MAX_MARKET_SYMBOL_LEN),
  refundPct: z.number().min(1).max(100),
  maxCostPct: z.number().min(0.01).max(100),
  liabilityCapUsd: z.number().min(1).max(10_000),
  maxUnhedgedUsd: z.number().min(1).max(10_000),
  deadlineMinutes: z.number().int().min(1).max(60 * 24 * 30),
});
export type LaunchInput = z.infer<typeof LaunchBody>;

/**
 * Build `create_campaign` (plus the owner's payout account if it doesn't exist yet). The operator pays fees and rent.
 *  - demo merchant: signed and sent server-side → { campaign, signature }
 *  - any other wallet: partially signed by the operator → { campaign, transaction } for the owner to co-sign
 */
export async function launch(b: LaunchInput): Promise<{ campaign: string; deadlineMinutes: number; signature?: string; transaction?: string }> {
  if (b.maxUnhedgedUsd > b.liabilityCapUsd) throw new HttpError(400, 'Max uncovered refunds cannot exceed the total refund cap.');
  // Sales must stop before the venue stops trading the market (else sales can't be protected).
  const [market, info] = await Promise.all([
    engineFetch<{ closesAt: string | null; status?: string }>(`/markets/${encodeURIComponent(b.marketSymbol)}`).catch(() => null),
    engineFetch<{ salesCutoffMinutes?: number }>('/health').catch(() => null),
  ]);
  if (!market || market.status === 'resolved') throw new HttpError(409, 'That game isn’t available any more — pick another one.');
  let deadlineMinutes = b.deadlineMinutes;
  if (market.closesAt) {
    const cutoff = info?.salesCutoffMinutes ?? 12;
    const minutesLeft = Math.floor((Date.parse(market.closesAt) - Date.now()) / 60_000) - cutoff;
    if (minutesLeft < 1) throw new HttpError(409, `This game is about to end — pick one that finishes later.`);
    deadlineMinutes = Math.min(deadlineMinutes, minutesLeft);
  }

  const { connection, program, operator, merchant: demoMerchant, usdcMint } = await serverCtx();
  let merchant = demoMerchant.publicKey;
  if (b.merchant) {
    try {
      merchant = new PublicKey(b.merchant);
    } catch {
      throw new HttpError(400, 'invalid owner wallet');
    }
  }
  const merchantUsdc = getAssociatedTokenAddressSync(usdcMint, merchant, true);
  const { ix, campaign } = await createCampaignIx(program, {
    payer: operator.publicKey,
    merchant,
    merchantUsdc,
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
  const ixs = [createAssociatedTokenAccountIdempotentInstruction(operator.publicKey, merchantUsdc, merchant, usdcMint), ix];

  if (merchant.equals(demoMerchant.publicKey)) {
    const signature = await sendAndConfirmTransaction(connection, new Transaction().add(...ixs), [operator, demoMerchant], { commitment: 'confirmed' });
    await engineFetch(`/campaigns/${campaign.toBase58()}/state`).catch(() => null);
    return { campaign: campaign.toBase58(), deadlineMinutes, signature };
  }
  const { tx } = await buildPartiallySignedTx(connection, operator.publicKey, ixs, [operator]);
  return {
    campaign: campaign.toBase58(),
    deadlineMinutes,
    transaction: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64'),
  };
}
