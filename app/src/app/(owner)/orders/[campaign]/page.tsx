'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { formatUsd } from '@oth/shared';
import type { CampaignState, OrderStatus, ShopOrder } from '@oth/shared/api';
import { TeamMark } from '@/components/GameCard';
import { Badge, Button, ButtonLink, EmptyState, Eyebrow, Notice, Skeleton } from '@/components/ui';
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
      <div className="mx-auto max-w-[480px]">
        <div className="card p-8 text-center">
          <h1 className="t-h1">Orders</h1>
          <p className="t-body mt-2 text-muted">Sign in as the shop to manage orders.</p>
          <Button onClick={owner.login} size="lg" block className="mt-7">Continue with Google or email</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Eyebrow>Counter</Eyebrow>
          <h1 className="t-h1 mt-2">Orders</h1>
          {game ? (
            <div className="mt-2 flex items-center gap-2 text-sm text-muted">
              <TeamMark game={game} size={22} />
              <span className="truncate">{game.matchup}{game.finalAt ? ` · final ${game.finalAt}` : ''}</span>
            </div>
          ) : null}
        </div>
        <ButtonLink href="/dashboard" variant="ghost" size="sm">← My promos</ButtonLink>
      </div>
      {state.data && !isOwner && owner.mode === 'privy' ? <Notice tone="caution">You’re viewing another shop’s orders — only that shop can update them.</Notice> : null}

      <div className="grid grid-cols-3 gap-2" role="tablist">
        {TABS.map((t) => {
          const n = all.filter((o) => o.status === t.key).length;
          return (
            <button key={t.key} role="tab" aria-pressed={tab === t.key} aria-selected={tab === t.key} onClick={() => setTab(t.key)} className="choice flex items-center justify-center gap-2">
              {t.label}
              <span className={`tabular rounded-full px-2 py-0.5 text-xs font-bold ${tab === t.key ? 'bg-brand text-white' : 'bg-paper text-muted'}`}>{n}</span>
            </button>
          );
        })}
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}

      {!orders.data ? (
        <div className="grid gap-4 sm:grid-cols-2"><Skeleton className="h-48 rounded-2xl" /><Skeleton className="h-48 rounded-2xl" /></div>
      ) : shown.length === 0 ? (
        <EmptyState icon={tab === 'new' ? '🧾' : '✓'} title={tab === 'new' ? 'No orders waiting' : 'Nothing here yet'} body={tab === 'new' ? 'New orders appear here the moment a customer pays.' : undefined} />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {shown.map((o) => (
          <div key={o.signature} className={`card animate-fade-up flex flex-col gap-4 p-5 ${o.status === 'new' ? 'ring-2 ring-brand/70' : ''}`}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-3xl font-bold tracking-wider">#{orderNumber(o.signature)}</span>
              <span className="text-sm text-subtle">{new Date(o.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
            </div>
            <ul className="space-y-1.5 text-lg">
              {o.lines.map((l) => (
                <li key={l.id} className="flex gap-2"><span className="tabular font-bold text-brand">{l.qty}×</span> {l.name}</li>
              ))}
            </ul>
            <div className="flex items-center justify-between gap-2 border-t border-line pt-3 text-sm">
              <Badge tone="win">Paid {formatUsd(o.amount)}</Badge>
              <span className="text-right text-muted">{Number(o.refund) > 0 && game ? `${formatUsd(o.refund)} back if ${game.team} wins` : ''}</span>
            </div>
            {o.status === 'new' ? (
              <Button loading={busy === o.signature} onClick={() => void move(o, 'ready')} size="lg" block>{busy === o.signature ? 'Saving…' : 'Mark ready'}</Button>
            ) : o.status === 'ready' ? (
              <Button loading={busy === o.signature} onClick={() => void move(o, 'done')} variant="success" size="lg" block>{busy === o.signature ? 'Saving…' : 'Picked up'}</Button>
            ) : (
              <Button loading={busy === o.signature} onClick={() => void move(o, 'ready')} variant="secondary" size="sm" block>Undo</Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
