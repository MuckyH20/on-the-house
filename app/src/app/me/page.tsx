'use client';

import Link from 'next/link';
import { formatUsd } from '@oth/shared';
import type { WalletClaim } from '@oth/shared/api';
import { Button, Card, EmptyState, Eyebrow, Pill, Simulated, Skeleton } from '@/components/ui';
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
      <header>
        <Eyebrow>Your game-day orders</Eyebrow>
        <h1 className="t-h1 mt-2">My rewards</h1>
      </header>
      {privyEnabled() ? (
        account.authenticated ? (
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Signed in{account.label ? ` as ${account.label}` : ''} — showing this device and your account</span>
            <button onClick={() => void account.logout()} className="underline">Sign out</button>
          </div>
        ) : (
          <Button onClick={account.login} disabled={!account.ready} variant="secondary" block>
            Sign in to see rewards from your other devices
          </Button>
        )
      ) : null}
      {totalBack > 0n ? (
        <div className="card animate-pop bg-good-soft p-6 text-center ring-1 ring-good/30">
          <div className="text-4xl" aria-hidden="true">🎉</div>
          <div className="t-h2 mt-2 text-good">You got {formatUsd(totalBack)} back!</div>
        </div>
      ) : null}
      {pending > 0n ? <div className="notice notice-info">Waiting on games: up to <b>{formatUsd(pending)}</b> could come back to you.</div> : null}

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
      {!claims.data && wallet ? <><Skeleton className="h-36 w-full rounded-2xl" /><Skeleton className="h-36 w-full rounded-2xl" /></> : null}
      {claims.data && list.length === 0 ? <EmptyState icon="🎟️" title="No game-day orders yet" body="Order from a shop’s promo page and your rewards will show up here." /> : null}
      {wallet ? <div className="pt-2 text-center text-xs text-subtle">Your rewards are saved on this device ({short(wallet, 4)}).</div> : null}
    </div>
  );
}
