import { formatUsd, parseUsd } from '@oth/shared';
import type { Quote } from '@oth/shared/api';
import { buildPartiallySignedTx, campaignRefs, fetchCampaign, purchaseIx } from '@oth/shared/program';
import { engineFetch, HttpError, jsonError, parsePubkey, serverCtx } from '@/lib/server';

/**
 * Solana Pay transaction request (https://docs.solanapay.com/spec), used by both the in-browser burner wallet
 * and wallets scanning the QR code:
 *   GET  → { label, icon }
 *   POST { account } → { transaction: base64, message }
 * The transaction is `purchase(amount, premium)` with the live premium, partially signed by the operator, who is
 * the fee payer and pays for any new token accounts — the customer only adds their signature.
 */
export const dynamic = 'force-dynamic';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
};

type Ctx = { params: Promise<{ campaign: string }> };

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  return Response.json({ label: 'UBC Coffee Cart', icon: `${origin}/icon.svg` }, { headers: CORS });
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    const { campaign: campaignParam } = await params;
    const url = new URL(req.url);
    const body = (await req.json().catch(() => ({}))) as { account?: unknown };
    const customer = parsePubkey(body.account, 'account');
    const campaignKey = parsePubkey(campaignParam, 'campaign');
    let amount: bigint;
    try {
      amount = parseUsd(url.searchParams.get('amount') ?? '');
    } catch {
      throw new HttpError(400, 'amount must be a dollar amount like 3.50');
    }
    if (amount <= 0n || amount > parseUsd('100')) throw new HttpError(400, 'amount must be between $0.01 and $100');
    const item = (url.searchParams.get('item') ?? 'your order').slice(0, 40);

    const { connection, program, operator, usdcMint, treasury } = await serverCtx();
    const c = await fetchCampaign(program, campaignKey);
    if (!c) throw new HttpError(404, 'campaign not found');
    if (c.merchant === customer.toBase58()) throw new HttpError(400, 'A shop can’t pay itself — use another account or this device.');

    const quote = await engineFetch<Quote>(`/quote/${c.address}?amount=${amount}`);
    if (!quote.available || !quote.premium) throw new HttpError(409, quote.reason ?? 'This promo is not available right now.');

    const ix = await purchaseIx(program, {
      operator: operator.publicKey,
      customer,
      campaign: campaignRefs(c),
      usdcMint,
      treasury,
      amount,
      premium: BigInt(quote.premium),
    });
    // Optional Solana Pay `reference`: a read-only, non-signer key appended to the instruction so the checkout
    // page can find this payment with getSignaturesForAddress(reference). Anchor ignores extra accounts.
    const ref = url.searchParams.get('reference');
    if (ref) ix.keys.push({ pubkey: parsePubkey(ref, 'reference'), isSigner: false, isWritable: false });
    const { tx } = await buildPartiallySignedTx(connection, operator.publicKey, [ix], [operator]);
    const transaction = tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64');
    return Response.json(
      {
        transaction,
        message: `${item} · ${formatUsd(amount)} · ${formatUsd(quote.refund ?? '0')} back if the promo hits`,
        // Extra fields for our own checkout UI (wallets ignore unknown fields).
        amount: amount.toString(),
        premium: quote.premium,
        refund: quote.refund,
        campaign: c.address,
        operator: operator.publicKey.toBase58(),
      },
      { headers: CORS },
    );
  } catch (e) {
    return jsonError(e, CORS);
  }
}
