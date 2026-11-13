'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { formatUsd } from '@oth/shared';
import type { CampaignState, OrderStatus, ShopOrder } from '@oth/shared/api';
import { engine, usePoll } from '@/lib/client';
import { gameFor } from '@/lib/game';
import { orderNumber } from '@/lib/order';
import { useOwner } from '@/lib/owner';
import { setOrderStatus } from '@/lib/shop';

const TABS: { key: OrderStatus; label: string }[] = [
  { key: 'new', label: 'To make' },
  { key: 'ready', label: 'Ready' },
  { key: 'done', label: 'Picked up' },
];

/** The counter screen: incoming promo orders, like any order-ahead ticket list. */
export default function OrdersPage() {
  const { campaign } = useParams<{ campaign: string }>();
  const owner = useOwner();
  const [tab, setTab] = useState<OrderStatus>('new');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const orders = usePoll(() => engine<{ orders: ShopOrder[] }>(`/campaigns/${campaign}/orders`), 3_000, [campaign]);
  const state = usePoll(() => engine<CampaignState>(`/campaigns/${campaign}/state`), 10_000, [campaign]);
  const game = gameFor(state.data?.market ?? null);
  const all = orders.data?.orders ?? [];
  const shown = all.filter((o) => o.status === tab).sort((a, b) => (tab === 'new' ? a.createdAt - b.createdAt : b.updatedAt - a.updatedAt));
  const isOwner = owner.address && state.data && owner.address === state.data.campaign.merchant;

  async function move(o: ShopOrder, status: OrderStatus) {
    setBusy(o.signature);
    setError(null);
    try {
      await setOrderStatus(owner, o.signature, status);
      await orders.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (owner.mode === 'privy' && !owner.authenticated) {
    return (
      <div className="mx-auto max-w-md py-10 text-center">
        <h1 className="text-2xl font-bold">Orders</h1>
        <p className="mt-2 text-muted">Sign in as the shop to manage orders.</p>
        <button onClick={owner.login} className="mt-6 w-full rounded-xl bg-brand py-3.5 font-semibold text-white">Continue with email or Google</button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-10">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Orders</h1>
          {game ? <div className="truncate text-sm text-muted">{game.emoji} {game.matchup}{game.finalAt ? ` · final ${game.finalAt}` : ''}</div> : null}
        </div>
        <Link href="/dashboard" className="text-sm text-muted underline">My promos</Link>
      </div>
      {state.data && !isOwner && owner.mode === 'privy' ? <div className="rounded-xl bg-warn-soft p-3 text-sm text-warn">You’re viewing another shop’s orders — only that shop can update them.</div> : null}

      <div className="grid grid-cols-3 gap-2">
        {TABS.map((t) => {
          const n = all.filter((o) => o.status === t.key).length;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} className={`rounded-xl border px-2 py-2.5 text-sm font-medium ${tab === t.key ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-card'}`}>
              {t.label} <span className="tabular">({n})</span>
            </button>
          );
        })}
      </div>
      {error ? <div className="rounded-xl bg-warn-soft p-3 text-sm text-warn">{error}</div> : null}

      {shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">
          {tab === 'new' ? 'No orders waiting. New orders appear here the moment a customer pays.' : 'Nothing here yet.'}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {shown.map((o) => (
          <div key={o.signature} className={`space-y-3 rounded-2xl border bg-card p-4 ${o.status === 'new' ? 'border-brand' : 'border-line'}`}>
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-3xl font-bold tracking-wider">#{orderNumber(o.signature)}</span>
              <span className="text-xs text-muted">{new Date(o.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
            </div>
            <ul className="space-y-1 text-base">
              {o.lines.map((l) => (
                <li key={l.id}><b>{l.qty}×</b> {l.name}</li>
              ))}
            </ul>
            <div className="flex items-center justify-between text-sm text-muted">
              <span>Paid {formatUsd(o.amount)} ✓</span>
              <span>{Number(o.refund) > 0 && game ? `${formatUsd(o.refund)} back if ${game.team} wins` : ''}</span>
            </div>
            {o.status === 'new' ? (
              <button disabled={busy === o.signature} onClick={() => void move(o, 'ready')} className="w-full rounded-xl bg-brand py-3 font-semibold text-white disabled:opacity-40">
                {busy === o.signature ? 'Saving…' : 'Mark ready'}
              </button>
            ) : o.status === 'ready' ? (
              <button disabled={busy === o.signature} onClick={() => void move(o, 'done')} className="w-full rounded-xl bg-good py-3 font-semibold text-white disabled:opacity-40">
                {busy === o.signature ? 'Saving…' : 'Picked up'}
              </button>
            ) : (
              <button disabled={busy === o.signature} onClick={() => void move(o, 'ready')} className="w-full rounded-xl border border-line py-2 text-sm text-muted">Undo</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
