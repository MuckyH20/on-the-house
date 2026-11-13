'use client';

import Link from 'next/link';
import { formatUsd } from '@oth/shared';
import type { WalletClaim } from '@oth/shared/api';
import { Card, Pill, Simulated } from '@/components/ui';
import { engine, short, useBurner, usePoll } from '@/lib/client';
import { gameFor } from '@/lib/game';
import { orderNumber } from '@/lib/order';
import { privyEnabled, useOwner } from '@/lib/owner';

export default function MePage() {
  const burner = useBurner();
  const account = useOwner();
  const wallet = burner?.publicKey.toBase58() ?? null;
  const accountWallet = account.authenticated ? account.address : null;
  // Rewards on this device's wallet plus the signed-in account's wallet (if any).
  const claims = usePoll(
    async () => {
      const wallets = [wallet, accountWallet].filter((w): w is string => !!w && w !== null);
      if (!wallets.length) return null;
      const lists = await Promise.all(
        wallets.map((w) =>
          engine<{ claims: WalletClaim[] }>(`/wallets/${w}/claims`).then((r) => r.claims.map((c) => ({ ...c, where: w === accountWallet ? 'account' : 'device' }) as WalletClaim & { where: string })),
        ),
      );
      return { claims: lists.flat() };
    },
    3_000,
    [wallet, accountWallet],
  );
  const list = claims.data?.claims ?? [];
  const totalBack = list.reduce((s, c) => s + BigInt(c.paidOut), 0n);
  const pending = list.filter((c) => c.status !== 'settled').reduce((s, c) => s + BigInt(c.claimBalance), 0n);

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">My rewards</h1>
      {privyEnabled() ? (
        account.authenticated ? (
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Signed in{account.label ? ` as ${account.label}` : ''} — showing this device and your account</span>
            <button onClick={() => void account.logout()} className="underline">Sign out</button>
          </div>
        ) : (
          <button onClick={account.login} disabled={!account.ready} className="w-full rounded-xl border border-line bg-card py-2.5 text-sm">
            Sign in to see rewards from your other devices
          </button>
        )
      ) : null}
      {totalBack > 0n ? (
        <Card className="border-good bg-good-soft text-center">
          <div className="text-3xl">🎉</div>
          <div className="text-xl font-bold text-good">You got {formatUsd(totalBack)} back!</div>
        </Card>
      ) : null}
      {pending > 0n ? <Card className="text-sm">Waiting on games: up to <b>{formatUsd(pending)}</b> could come back to you.</Card> : null}

      {list.map((c) => {
        const spent = c.purchases.reduce((s, p) => s + BigInt(p.amount), 0n);
        const promised = c.purchases.reduce((s, p) => s + BigInt(p.refund), 0n);
        const condition = c.market?.condition ?? c.marketSymbol;
        return (
          <Card key={`${c.campaign}-${(c as { where?: string }).where ?? ''}`} className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="text-sm">
                <div className="font-medium">{gameFor(c.market)?.matchup ?? 'Game-day promo'}</div>
                <div className="text-muted">{c.refundBps >= 10_000 ? 'Free' : `${c.refundBps / 100}% back`} if {gameFor(c.market)?.condition ?? condition}</div>
              </div>
              {c.status === 'settled' ? (
                c.outcome === 'yes' ? <Pill tone="good">Won · {formatUsd(c.paidOut)} back</Pill> : <Pill tone="muted">Lost this time</Pill>
              ) : (
                <Pill tone="brand">Game on</Pill>
              )}
            </div>
            <div className="tabular text-sm">
              You spent {formatUsd(spent)} · {c.status === 'settled' && c.outcome === 'yes' ? <>you got <b>{formatUsd(c.paidOut)}</b> back</> : <>you’d get {formatUsd(promised)} back</>}
            </div>
            <div className="flex flex-wrap gap-2">
              {c.market?.simulated || c.marketSymbol.startsWith('SIM-') ? <Simulated label="SIMULATED (practice)" /> : null}
              {privyEnabled() ? <span className="text-[11px] text-muted">{(c as { where?: string }).where === 'account' ? 'In your account' : 'On this device'}</span> : null}
            </div>
            <ul className="text-xs text-muted">
              {c.purchases.map((p) => (
                <li key={p.signature}>
                  Order #{orderNumber(p.signature)} · {p.at ? new Date(p.at * 1000).toLocaleTimeString() : 'just now'} · paid {formatUsd(p.amount)} ·{' '}
                  <a className="underline" href={`https://explorer.solana.com/tx/${p.signature}?cluster=devnet`} target="_blank" rel="noreferrer">public receipt</a>
                </li>
              ))}
            </ul>
            <Link href={`/proof/${c.campaign}`} className="text-xs text-brand underline">How your refund is guaranteed</Link>
          </Card>
        );
      })}
      {claims.data && list.length === 0 ? <Card className="text-sm text-muted">No game-day orders yet on this device.</Card> : null}
      {wallet ? <div className="text-center text-xs text-muted">Your rewards are saved on this device ({short(wallet, 4)}).</div> : null}
    </div>
  );
}
