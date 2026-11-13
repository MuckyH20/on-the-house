'use client';

import Link from 'next/link';
import { formatUsd } from '@oth/shared';
import type { CampaignSummary } from '@oth/shared/api';
import { GameCard } from '@/components/GameCard';
import { engine, usePoll } from '@/lib/client';
import { gameFor } from '@/lib/game';
import { useOwner } from '@/lib/owner';
import { cents, offerText } from '@/lib/shop';
import { useState } from 'react';

function statusLine(s: CampaignSummary): { tone: 'live' | 'warn' | 'good' | 'muted'; text: string } {
  const c = s.campaign;
  const team = gameFor(s.market)?.team ?? 'Your team';
  if (c.status === 'settled') {
    if (c.purchaseCount === 0) return { tone: 'muted', text: `${team} ${c.outcome === 'yes' ? 'won' : 'lost'} — no orders on this promo` };
    return c.outcome === 'yes'
      ? { tone: 'good', text: `${team} won — customers got ${formatUsd(c.totalPaidOut)} back, paid by us` }
      : { tone: 'muted', text: `${team} lost — you kept every sale` };
  }
  if (c.status === 'cancelled') return { tone: 'muted', text: 'Cancelled' };
  if (c.status === 'paused') return { tone: 'warn', text: s.hedger.pausedByHedger ? 'Paused — prices moved; resumes automatically' : 'Paused' };
  if (c.salesDeadline * 1000 < Date.now()) return { tone: 'muted', text: 'Sales closed — waiting for the final result' };
  return { tone: 'live', text: s.coverageBps >= 10_000 ? 'Live · every refund is protected' : 'Live · protecting the latest orders…' };
}

export default function DashboardPage() {
  const owner = useOwner();
  const [showAll, setShowAll] = useState(false);
  const list = usePoll(
    async () => (owner.address ? engine<{ campaigns: CampaignSummary[] }>(`/campaigns?merchant=${owner.address}`) : null),
    4_000,
    [owner.address],
  );

  if (!owner.ready) return <div className="py-20 text-center text-muted">Loading…</div>;
  if (owner.mode === 'privy' && !owner.authenticated) {
    return (
      <div className="mx-auto max-w-md py-10 text-center">
        <h1 className="text-2xl font-bold">My promos</h1>
        <p className="mt-2 text-muted">Sign in to see your promos.</p>
        <button onClick={owner.login} className="mt-6 w-full rounded-xl bg-brand py-3.5 font-semibold text-white">Continue with email or Google</button>
      </div>
    );
  }
  const all = list.data?.campaigns ?? [];
  const isPast = (x: CampaignSummary) => x.campaign.status === 'settled' || x.campaign.status === 'cancelled';
  const live = all.filter((x) => !isPast(x));
  const past = all.filter(isPast);
  return (
    <div className="mx-auto max-w-md space-y-4 pb-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My promos</h1>
        <Link href="/start" className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white">New promo</Link>
      </div>
      {owner.label ? (
        <div className="flex items-center justify-between text-xs text-muted">
          <span>Signed in as {owner.label}</span>
          {owner.mode === 'privy' ? <button onClick={() => void owner.logout()} className="underline">Sign out</button> : null}
        </div>
      ) : null}
      {list.data && all.length === 0 ? (
        <div className="rounded-2xl border border-line bg-card p-6 text-center">
          <p className="text-muted">No promos yet.</p>
          <Link href="/start" className="mt-3 inline-block text-brand underline">Start your first promo</Link>
        </div>
      ) : null}

      {list.data && all.length > 0 ? (
        <>
          <h2 className="pt-2 text-sm font-semibold uppercase tracking-wider text-muted">Live now</h2>
          {live.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line p-5 text-center text-sm text-muted">
              Nothing live right now. <Link href="/start" className="text-brand underline">Start a promo</Link>
            </div>
          ) : (
            live.map((s) => <PromoCard key={s.campaign.address} s={s} />)
          )}

          {past.length > 0 ? (
            <div className="pt-2">
              <button onClick={() => setShowAll((v) => !v)} className="flex w-full items-center justify-between rounded-xl border border-line bg-card px-4 py-3 text-sm">
                <span className="font-semibold">Past promos ({past.length})</span>
                <span className="text-muted">{showAll ? 'Hide' : 'Show'}</span>
              </button>
              {showAll ? <div className="mt-3 space-y-3">{past.map((s) => <PromoCard key={s.campaign.address} s={s} />)}</div> : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function PromoCard({ s }: { s: CampaignSummary }) {
  const game = gameFor(s.market);
  const st = statusLine(s);
  const c = s.campaign;
  const tone = { live: 'text-good', warn: 'text-warn', good: 'text-good', muted: 'text-muted' }[st.tone];
  const finished = c.status === 'settled' || c.status === 'cancelled' || c.salesDeadline * 1000 < Date.now();
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-card p-3">
      {game ? <GameCard game={game} offer={offerText(c.refundBps / 100)} compact /> : null}
      <div className={`px-1 text-sm font-medium ${tone}`}>{st.text}</div>
      <div className="grid grid-cols-3 gap-2 px-1 text-center text-xs text-muted">
        <div><div className="tabular text-base font-semibold text-ink">{c.purchaseCount}</div>orders</div>
        <div><div className="tabular text-base font-semibold text-ink">{formatUsd(cents(c.totalSales))}</div>sales</div>
        <div><div className="tabular text-base font-semibold text-ink">{formatUsd(cents(c.totalPremium))}</div>promo cost</div>
      </div>
      <div className="flex gap-2 text-sm">
        <Link href={`/p/${c.address}`} className="flex-1 rounded-lg border border-line py-2 text-center">Open page</Link>
        {!finished ? <Link href={`/p/${c.address}/print`} target="_blank" className="flex-1 rounded-lg border border-line py-2 text-center">Print sign</Link> : null}
        <Link href={`/proof/${c.address}`} className="flex-1 rounded-lg border border-line py-2 text-center">Details</Link>
      </div>
    </div>
  );
}
