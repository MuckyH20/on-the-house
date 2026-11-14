/**
 * QuickNode Streams filter — On the House.
 * Network: solana-devnet · Dataset: programs_with_logs (https://www.quicknode.com/docs/streams)
 *
 * Input:  stream.data = one array per block, each holding transaction objects:
 *         { signature, slot, blockTime, programInvocations: [{ programId, instruction }], logs: [...], success }
 * Output: only successful transactions that invoked our program, trimmed to what the engine needs to decode
 *         Anchor events (signature, slot, blockTime, log lines). Returning null skips delivery for the batch.
 *
 * __PROGRAM_ID__ is replaced with PROGRAM_ID by scripts/src/create-stream.ts before upload.
 */
function main(stream) {
  const PROGRAM_ID = '__PROGRAM_ID__';
  const matches = [];

  for (const block of stream.data || []) {
    for (const tx of block || []) {
      if (!tx || tx.success === false) continue;
      const invoked = (tx.programInvocations || []).some((p) => p && p.programId === PROGRAM_ID);
      const logged = (tx.logs || []).some((line) => typeof line === 'string' && line.startsWith('Program ' + PROGRAM_ID + ' invoke'));
      if (!invoked && !logged) continue;
      matches.push({ signature: tx.signature, slot: tx.slot, blockTime: tx.blockTime, logs: tx.logs || [] });
    }
  }

  return matches.length ? { programId: PROGRAM_ID, transactions: matches } : null;
}
