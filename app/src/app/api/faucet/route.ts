import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToCheckedInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { Transaction } from '@solana/web3.js';
import { formatUsd, sendAndConfirm, USDC_DECIMALS, USDC_UNIT } from '@oth/shared';
import { HttpError, jsonError, parsePubkey, serverCtx } from '@/lib/server';

/**
 * Demo dollars (mock dUSDC) for a wallet: creates its token account if needed and mints enough to cover the
 * customer's cart (at least FAUCET_AMOUNT_USD). The operator pays all fees, so burner wallets never need SOL.
 *
 * Limits: a wallet that already holds FAUCET_MAX_BALANCE_USD gets nothing more, a short per-wallet guard stops
 * double taps, and a global per-minute cap protects the operator's devnet SOL. No long waits between promos.
 */
export const dynamic = 'force-dynamic';

const lastByWallet = new Map<string, number>();
const recent: number[] = [];
const GLOBAL_PER_MINUTE = 30;

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { wallet?: unknown; need?: unknown };
    const wallet = parsePubkey(body.wallet, 'wallet');
    const need = typeof body.need === 'string' && /^\d{1,15}$/.test(body.need) ? BigInt(body.need) : 0n;
    const { env, connection, operator, usdcMint } = await serverCtx();

    const now = Date.now();
    const key = wallet.toBase58();
    const wait = env.FAUCET_COOLDOWN_SECONDS * 1000 - (now - (lastByWallet.get(key) ?? 0));
    if (wait > 0) throw new HttpError(429, 'Adding your demo dollars — one moment.');
    while (recent.length && now - recent[0]! > 60_000) recent.shift();
    if (recent.length >= GLOBAL_PER_MINUTE) throw new HttpError(429, 'Lots of people are grabbing demo dollars. Try again in a minute.');

    const ata = getAssociatedTokenAddressSync(usdcMint, wallet, true);
    const balance = BigInt((await connection.getTokenAccountBalance(ata, 'confirmed').catch(() => null))?.value.amount ?? '0');
    const max = BigInt(env.FAUCET_MAX_BALANCE_USD) * USDC_UNIT;
    if (balance >= max) throw new HttpError(400, `You already have ${formatUsd(balance)} in demo dollars, which is plenty.`);
    // Enough for the cart, at least the standard top-up, never past the cap. Whole dollars.
    const shortfall = need > balance ? need - balance : 0n;
    let amount = ((shortfall + USDC_UNIT - 1n) / USDC_UNIT) * USDC_UNIT;
    const standard = BigInt(env.FAUCET_AMOUNT_USD) * USDC_UNIT;
    if (amount < standard) amount = standard;
    if (balance + amount > max) amount = ((max - balance) / USDC_UNIT) * USDC_UNIT;
    if (amount <= 0n) throw new HttpError(400, `You already have ${formatUsd(balance)} in demo dollars, which is plenty.`);

    lastByWallet.set(key, now);
    recent.push(now);
    const tx = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(operator.publicKey, ata, wallet, usdcMint),
      createMintToCheckedInstruction(usdcMint, ata, operator.publicKey, amount, USDC_DECIMALS),
    );
    try {
      const signature = await sendAndConfirm(connection, tx, [operator]);
      return Response.json({ ok: true, amount: amount.toString(), message: `Added ${formatUsd(amount)} in demo dollars`, signature });
    } catch (e) {
      lastByWallet.delete(key); // a failed mint doesn't count
      throw e;
    }
  } catch (e) {
    return jsonError(e);
  }
}
