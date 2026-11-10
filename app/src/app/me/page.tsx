'use client';

import Link from 'next/link';
import { formatUsd } from '@oth/shared';
import type { WalletClaim } from '@oth/shared/api';
import { Card, Pill, Simulated } from '@/components/ui';
import { engine, short, useBurner, usePoll } from '@/lib/client';

export default function MePage() {
  const burner = useBurner();
  const wallet = burner?.publicKey.toBase58() ?? null;
  const claims = usePoll(
    async () => (wallet ? engine<{ claims: WalletClaim[] }>(`/wallets/${wallet}/claims`) : null),
    3_000,
    [wallet],
  );
  const list = claims.data?.claims ?? [];
  const totalBack = list.reduce((s, c) => s + BigInt(c.paidOut), 0n);
  const pending = list.filter((c) => c.status !== 'settled').reduce((s, c) => s + BigInt(c.claimBalance), 0n);

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">My refunds</h1>
      {totalBack > 0n ? (
        <Card className="border-good bg-good-soft text-center">
          <div className="text-3xl">🎉</div>
          <div className="text-xl font-bold text-good">You got {formatUsd(totalBack)} back!</div>
        </Card>
      ) : null}
      {pending > 0n ? <Card className="text-sm">Waiting on results: up to <b>{formatUsd(pending)}</b> could come back to you.</Card> : null}

      {list.map((c) => {
        const spent = c.purchases.reduce((s, p) => s + BigInt(p.amount), 0n);
        const promised = c.purchases.reduce((s, p) => s + BigInt(p.refund), 0n);
        const condition = c.market?.condition ?? c.marketSymbol;
        return (
          <Card key={c.campaign} className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="text-sm">
                <div className="font-medium">UBC Coffee Cart</div>
                <div className="text-muted">{c.refundBps / 100}% back if {condition}</div>
              </div>
              {c.status === 'settled' ? (
                c.outcome === 'yes' ? <Pill tone="good">Refunded {formatUsd(c.paidOut)}</Pill> : <Pill tone="muted">Didn’t happen</Pill>
              ) : (
                <Pill tone="brand">Waiting</Pill>
              )}
            </div>
            <div className="tabular text-sm">
              You spent {formatUsd(spent)} · {c.status === 'settled' && c.outcome === 'yes' ? <>you got <b>{formatUsd(c.paidOut)}</b> back</> : <>you’d get {formatUsd(promised)} back</>}
            </div>
            {c.market?.simulated ? <Simulated /> : null}
            <ul className="text-xs text-muted">
              {c.purchases.map((p) => (
                <li key={p.signature}>
                  {p.at ? new Date(p.at * 1000).toLocaleTimeString() : 'just now'} · paid {formatUsd(p.amount)} ·{' '}
                  <a className="underline" href={`https://explorer.solana.com/tx/${p.signature}?cluster=devnet`} target="_blank" rel="noreferrer">receipt</a>
                </li>
              ))}
            </ul>
            <Link href={`/proof/${c.campaign}`} className="text-xs text-brand underline">How this refund is guaranteed</Link>
          </Card>
        );
      })}
      {claims.data && list.length === 0 ? <Card className="text-sm text-muted">No purchases yet from this device.</Card> : null}
      {wallet ? <div className="text-center text-xs text-muted">Demo wallet on this device: {short(wallet, 6)}</div> : null}
    </div>
  );
}
