'use client';

import Link from 'next/link';
import { formatUsd } from '@oth/shared';
import type { CampaignSummary } from '@oth/shared/api';
import { TeamMark } from '@/components/GameCard';
import { Badge, Button, ButtonLink, CampaignStatus, EmptyState, Eyebrow, Notice, PageSkeleton, Skeleton, Stat } from '@/components/ui';
import { engine, usePoll } from '@/lib/client';
import { gameFor } from '@/lib/game';
import { useOwner } from '@/lib/owner';
import { cents, finishPractice, offerText } from '@/lib/shop';
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

  if (!owner.ready) return <PageSkeleton cards={3} />;
  if (owner.mode === 'privy' && !owner.authenticated) {
    return (
      <div className="mx-auto max-w-[480px]">
        <div className="card p-8 text-center">
          <h1 className="t-h1">My promos</h1>
          <p className="t-body mt-2 text-muted">Sign in to see and manage your promos.</p>
          <Button onClick={owner.login} size="lg" block className="mt-7">Continue with Google or email</Button>
        </div>
      </div>
    );
  }
  const all = list.data?.campaigns ?? [];
  const isPast = (x: CampaignSummary) => x.campaign.status === 'settled' || x.campaign.status === 'cancelled';
  const live = all.filter((x) => !isPast(x));
  const past = all.filter(isPast);
  const sum = (f: (x: CampaignSummary) => bigint) => all.reduce((acc, x) => acc + f(x), 0n);
  const totals = {
    orders: all.reduce((n, x) => n + x.campaign.purchaseCount, 0),
    received: sum((x) => BigInt(x.campaign.totalSales) - BigInt(x.campaign.totalPremium)),
    cost: sum((x) => BigInt(x.campaign.totalPremium)),
    refunded: sum((x) => BigInt(x.campaign.totalPaidOut)),
  };
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Dashboard</Eyebrow>
          <h1 className="t-h1 mt-2">My promos</h1>
          {owner.label ? (
            <div className="mt-1.5 flex items-center gap-3 text-sm text-muted">
              <span>Signed in as {owner.label}</span>
              {owner.mode === 'privy' ? <button onClick={() => void owner.logout()} className="link-muted">Sign out</button> : null}
            </div>
          ) : null}
        </div>
        <ButtonLink href="/start">+ New promo</ButtonLink>
      </div>

      {!list.data ? (
        <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-56 rounded-2xl" /><Skeleton className="h-56 rounded-2xl" /></div>
      ) : all.length === 0 ? (
        <EmptyState icon="🏆" title="No promos yet" body="Launch your first “free if your team wins” promo — it takes about two minutes." action={<ButtonLink href="/start">Start your first promo</ButtonLink>} />
      ) : (
        <>
          <div className="card grid grid-cols-2 gap-6 p-5 sm:grid-cols-4 sm:p-6">
            <Stat label="Live promos" value={live.length} />
            <Stat label="Orders" value={totals.orders} />
            <Stat label="You received" value={formatUsd(cents(totals.received))} />
            <Stat label="Refunds paid by us" value={formatUsd(cents(totals.refunded))} sub={`promo cost ${formatUsd(cents(totals.cost))}`} />
          </div>

          <section>
            <h2 className="t-label mb-3 text-subtle">Live now</h2>
            {live.length === 0 ? (
              <EmptyState icon="📣" title="Nothing live right now" body="Your finished promos are below." action={<ButtonLink href="/start" variant="secondary">Start a promo</ButtonLink>} />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">{live.map((s) => <PromoCard key={s.campaign.address} s={s} />)}</div>
            )}
          </section>

          {past.length > 0 ? (
            <section>
              <button onClick={() => setShowAll((v) => !v)} className="card flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-paper" aria-expanded={showAll}>
                <span className="font-semibold">Past promos <span className="text-subtle">({past.length})</span></span>
                <span className={`text-muted transition-transform ${showAll ? 'rotate-180' : ''}`} aria-hidden="true">⌄</span>
              </button>
              {showAll ? <div className="mt-4 grid gap-4 md:grid-cols-2">{past.map((s) => <PromoCard key={s.campaign.address} s={s} />)}</div> : null}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function PromoCard({ s }: { s: CampaignSummary }) {
  const game = gameFor(s.market);
  const st = statusLine(s);
  const c = s.campaign;
  const tone = { live: 'text-good', warn: 'text-caution', good: 'text-good', muted: 'text-muted' }[st.tone];
  const finished = c.status === 'settled' || c.status === 'cancelled' || c.salesDeadline * 1000 < Date.now();
  const sellsUntil = new Date(c.salesDeadline * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return (
    <div className="card card-hover flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        {game ? <TeamMark game={game} size={40} /> : null}
        <div className="min-w-0 flex-1">
          <div className="font-semibold leading-snug tracking-tight">{game?.matchup ?? (c.marketSymbol.startsWith('SIM-') ? 'Practice game' : 'Game-day promo')}</div>
          <div className="mt-0.5 text-xs text-muted">
            {offerText(c.refundBps / 100)} if they win{game?.finalAt ? ` · final ${game.finalAt}` : ''}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <CampaignStatus status={c.status} outcome={c.outcome} pausedByHedger={s.hedger.pausedByHedger} />
          {c.marketSymbol.startsWith('SIM-') ? <Badge tone="caution">Practice</Badge> : null}
        </div>
      </div>
      <div className={`text-sm font-medium ${tone}`}>{st.text}</div>
      <div className="grid grid-cols-3 gap-2 rounded-xl bg-paper px-3 py-3 text-center">
        <Stat label="Orders" value={c.purchaseCount} />
        <Stat label="You received" value={formatUsd(cents(BigInt(c.totalSales) - BigInt(c.totalPremium)))} />
        <Stat label="Promo cost" value={formatUsd(cents(c.totalPremium))} />
      </div>
      {!finished && sellsUntil ? <div className="text-xs text-muted">Selling until {sellsUntil}</div> : null}
      {c.marketSymbol.startsWith('SIM-PRACTICE-') && c.status !== 'settled' ? <PracticeFinish campaign={c.address} team={game?.team ?? 'Team'} /> : null}
      <div className="mt-auto space-y-2">
        {c.status !== 'cancelled' && c.purchaseCount > 0 ? <ButtonLink href={`/orders/${c.address}`} variant="dark" block>Orders</ButtonLink> : null}
        <div className="flex gap-2">
          <ButtonLink href={`/p/${c.address}`} variant="secondary" size="sm" className="flex-1">Open page</ButtonLink>
          {!finished ? <ButtonLink href={`/p/${c.address}/print`} target="_blank" variant="secondary" size="sm" className="flex-1">Print sign</ButtonLink> : null}
          <ButtonLink href={`/proof/${c.address}`} variant="secondary" size="sm" className="flex-1">Details</ButtonLink>
        </div>
      </div>
    </div>
  );
}

/** Practice games only: end the game now to show what happens (a real game ends on its own at the final). */
function PracticeFinish({ campaign, team }: { campaign: string; team: string }) {
  const owner = useOwner();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const finish = async (outcome: 'yes' | 'no') => {
    setBusy(true);
    try {
      await finishPractice(owner, campaign, outcome);
      setDone(outcome === 'yes' ? `${team} wins — refunds are being paid…` : `${team} loses — you keep every sale.`);
    } catch (e) {
      setDone((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (done) return <Notice tone="good">{done}</Notice>;
  return (
    <div className="notice notice-caution flex flex-wrap items-center gap-2">
      <span className="flex-1">Practice game — end it now:</span>
      <button disabled={busy} onClick={() => void finish('yes')} className="btn btn-success btn-sm">{team} wins</button>
      <button disabled={busy} onClick={() => void finish('no')} className="btn btn-secondary btn-sm">{team} loses</button>
    </div>
  );
}
