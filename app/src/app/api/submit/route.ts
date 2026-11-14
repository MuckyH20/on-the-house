import { Transaction } from '@solana/web3.js';
import { confirmSignature, TxError } from '@oth/shared';
import { HttpError, jsonError, serverCtx } from '@/lib/server';

/**
 * Submit a transaction the server built and the operator partially signed, after the owner co-signed it
 * (e.g. launching a promo from a Privy wallet). Only transactions paid for and signed by the operator are accepted.
 */
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { transaction } = (await req.json().catch(() => ({}))) as { transaction?: unknown };
    if (typeof transaction !== 'string') throw new HttpError(400, 'transaction (base64) required');
    const { connection, operator } = await serverCtx();
    let tx: Transaction;
    try {
      tx = Transaction.from(Buffer.from(transaction, 'base64'));
    } catch {
      throw new HttpError(400, 'invalid transaction');
    }
    if (!tx.feePayer?.equals(operator.publicKey)) throw new HttpError(400, 'transaction was not prepared by this server');
    if (!tx.verifySignatures(true)) throw new HttpError(400, 'transaction is missing a signature');
    const lastValid = (await connection.getBlockHeight('confirmed')) + 150;
    const signature = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 5 });
    try {
      await confirmSignature(connection, signature, lastValid, 'confirmed');
    } catch (e) {
      throw new HttpError(e instanceof TxError ? 400 : 504, (e as Error).message);
    }
    return Response.json({ signature });
  } catch (e) {
    return jsonError(e);
  }
}
