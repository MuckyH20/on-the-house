import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToCheckedInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { Transaction } from '@solana/web3.js';
import { formatUsd, sendAndConfirm, USDC_DECIMALS, USDC_UNIT } from '@oth/shared';
import { HttpError, jsonError, parsePubkey, serverCtx } from '@/lib/server';

/**
 * Demo dollars (mock dUSDC) for a wallet: creates its token account if needed and mints FAUCET_AMOUNT_USD.
 * The operator pays all fees, so burner wallets never need SOL. Rate-limited per wallet (in memory) plus a
 * global per-minute cap to protect the operator's devnet SOL.
 */
export const dynamic = 'force-dynamic';

const lastByWallet = new Map<string, number>();
const recent: number[] = [];
const GLOBAL_PER_MINUTE = 30;

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { wallet?: unknown };
    const wallet = parsePubkey(body.wallet, 'wallet');
    const { env, connection, operator, usdcMint } = await serverCtx();

    const now = Date.now();
    const key = wallet.toBase58();
    const last = lastByWallet.get(key) ?? 0;
    const wait = env.FAUCET_COOLDOWN_SECONDS * 1000 - (now - last);
    if (wait > 0) throw new HttpError(429, `You already got demo dollars. Try again in ${Math.ceil(wait / 1000)}s.`);
    while (recent.length && now - recent[0]! > 60_000) recent.shift();
    if (recent.length >= GLOBAL_PER_MINUTE) throw new HttpError(429, 'The demo faucet is busy — try again in a minute.');
    lastByWallet.set(key, now);
    recent.push(now);

    const ata = getAssociatedTokenAddressSync(usdcMint, wallet, true);
    const amount = BigInt(env.FAUCET_AMOUNT_USD) * USDC_UNIT;
    const tx = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(operator.publicKey, ata, wallet, usdcMint),
      createMintToCheckedInstruction(usdcMint, ata, operator.publicKey, amount, USDC_DECIMALS),
    );
    try {
      const signature = await sendAndConfirm(connection, tx, [operator]);
      return Response.json({ ok: true, amount: amount.toString(), message: `Added ${formatUsd(amount)} in demo dollars`, signature });
    } catch (e) {
      lastByWallet.delete(key); // don't charge the cooldown for a failed mint
      throw e;
    }
  } catch (e) {
    return jsonError(e);
  }
}
