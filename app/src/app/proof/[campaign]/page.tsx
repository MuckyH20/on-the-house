'use client';

import { useParams } from 'next/navigation';
import { formatBps, formatUsd, microsToPrice } from '@oth/shared';
import type { CampaignState, HedgeFill, StoredEvent } from '@oth/shared/api';
import { Radio, SearchX, ShieldCheck, Wallet, Waypoints } from 'lucide-react';
import { Badge, CampaignStatus, CoverageBar, EmptyState, PageSkeleton, Simulated } from '@/components/ui';
import { BackLink } from '@/components/BackLink';
import { gameFor } from '@/lib/game';
import { orderNumber } from '@/lib/order';
import { short, useEngineStream } from '@/lib/client';

const tx = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
const addr = (a: string) => `https://explorer.solana.com/address/${a}?cluster=devnet`;

const EVENT_LABEL: Record<string, (e: StoredEvent) => string> = {
  campaignCreated: () => 'Promo launched',
  purchaseEvent: (e) => `Order #${orderNumber(e.signature)} · ${formatUsd(String(e.data.amount))} — ${formatUsd(String(e.data.refund))} refund promised`,
  hedgeRecorded: (e) => `Protection bought: ${e.data.contractsAdded} × $1 contracts at $${microsToPrice(BigInt(String(e.data.avgPriceMicros)))}`,
  campaignPauseChanged: (e) => (e.data.paused ? 'Sales paused' : 'Sales resumed'),
  campaignSettled: (e) => `Final result: ${String(e.data.outcome) === 'yes' ? 'won' : 'lost'}`,
  payoutEvent: (e) => `Refund of ${formatUsd(String(e.data.amount))} paid to a customer`,
  claimsClosed: () => 'Unused refund claim closed',
  campaignCancelled: () => 'Promo cancelled',
};

export default function ProofPage() {
  const { campaign } = useParams<{ campaign: string }>();
  const { data: s, live, error } = useEngineStream<CampaignState>(`/campaigns/${campaign}/stream`, `/campaigns/${campaign}/state`);

  if (!s) return error ? <div className="mx-auto max-w-md pt-10"><EmptyState icon={SearchX} title="Can’t load this promo" body={error} /></div> : <PageSkeleton cards={3} />;
  const c = s.campaign;
  const game = gameFor(s.market);
  const fully = s.coverageBps >= 10_000;
  const outcome = c.status === 'settled' ? (c.outcome === 'yes' ? 'won' : 'lost') : null;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="space-y-3">
        <BackLink href={`/p/${campaign}`} className="-mb-1" />
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="t-h1">Protection details</h1>
          <CampaignStatus status={c.status} outcome={c.outcome} pausedByHedger={s.hedger.pausedByHedger} />
          <span className="flex items-center gap-1.5 text-xs text-subtle">
            <span className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-good' : 'bg-line-strong'}`} aria-hidden="true" />
            {live ? 'Live updates' : 'Updating…'}
          </span>
        </div>
        <p className="t-body text-muted">
          {c.refundBps >= 10_000 ? 'Customers’ orders are free' : `Customers get ${c.refundBps / 100}% back`} if <b className="text-ink">{game?.condition ?? s.market?.condition ?? c.marketSymbol}</b>. Every refund promised to a
          customer is backed by a matching contract on Gemini that pays out if it happens.
        </p>
        <div className="flex flex-wrap gap-2">
          <Simulated show={s.simulated.gemini} label="SIMULATED protection (demo order book)" />
          <Simulated show={s.simulated.resolution} label="SIMULATED result" />
          {s.venue ? <Badge tone="info">Gemini test market · test funds</Badge> : null}
        </div>
      </header>

      <section className="card space-y-5 p-5 sm:p-6">
        {outcome ? (
          <div className={`notice ${outcome === 'won' ? 'notice-good font-medium' : 'bg-paper text-muted'}`}>
            {outcome === 'won'
              ? `${game?.team ?? 'The team'} won — ${formatUsd(c.totalPaidOut)} refunded to customers automatically.`
              : `${game?.team ?? 'The team'} lost — no refunds were owed. The shop kept every sale.`}
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Refunds promised" value={formatUsd(s.promised)} />
          <Stat label="Protected" value={formatUsd(s.covered)} sub={fully ? 'fully covered ✓' : `${(s.coverageBps / 100).toFixed(0)}% — catching up`} />
          <Stat label="Refunds paid" value={formatUsd(c.totalPaidOut)} sub={outcome ? `final: ${outcome}` : 'after the game'} />
        </div>
        <CoverageBar bps={s.coverageBps} />
        {s.venue ? (
          <div className="rounded-xl bg-info-soft p-4 text-sm">
            <div className="t-label text-info">Gemini’s own records</div>
            <div className="mt-1 grid gap-1 sm:grid-cols-3">
              <div>Contracts held: <b className="tabular">{s.venue.positionContracts ?? '0'}</b></div>
              <div>Gemini’s result: <b>{s.venue.resolutionSide ? (s.venue.resolutionSide === 'yes' ? 'won' : 'lost') : 'not yet'}</b></div>
              <div>Gemini paid out: <b className="tabular">{s.venue.settledPayout != null ? `$${s.venue.settledPayout}` : '—'}</b></div>
            </div>
          </div>
        ) : null}
        {s.hedger.pausedByHedger ? <div className="notice notice-caution">Sales are paused because protection got more expensive than the shop allowed. They resume automatically.</div> : null}
      </section>

      <SalePipeline events={s.events} fills={s.fills} simulated={s.simulated.gemini} />

      {(() => {
        const orders = s.events.filter((e) => e.name === 'purchaseEvent');
        if (!orders.length) return null;
        return (
          <section className="card p-5 sm:p-6">
            <h2 className="t-h3">Orders <span className="text-subtle">({orders.length})</span></h2>
            <div className="mt-2 divide-y divide-line text-sm">
              {orders.slice(0, 20).map((e) => (
                <div key={`${e.signature}:${e.index}`} className="flex items-center gap-3 py-2">
                  <span className="font-mono font-semibold tracking-wider">#{orderNumber(e.signature)}</span>
                  <span className="tabular flex-1 text-muted">{formatUsd(String(e.data.amount))}</span>
                  <span className="hidden text-xs text-subtle sm:inline">{SOURCE_LABEL[e.source]}</span>
                  <span className="text-xs text-muted">{e.blockTime ? new Date(e.blockTime * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'just now'}</span>
                </div>
              ))}
            </div>
          </section>
        );
      })()}

      <details className="card group p-5 sm:p-6">
        <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
          For the curious: the public record on Solana
          <span className="text-muted transition-transform group-open:rotate-180" aria-hidden="true">⌄</span>
        </summary>
        <div className="mt-3 space-y-4 text-sm">
          <div className="grid gap-1 text-xs text-muted sm:grid-cols-2">
            <div>Market: <code>{c.marketSymbol}</code>{s.market?.yesAsk ? ` · price $${s.market.yesAsk}` : ''}</div>
            <div>Orders: {c.purchaseCount} · {formatUsd(c.totalSales)} · shop’s max cost {formatBps(c.maxPremiumBps)} per sale</div>
            <div>Promo account on Solana: <a className="underline" href={addr(c.address)} target="_blank" rel="noreferrer">{short(c.address, 6)}</a></div>
            <div>Uncovered right now: {formatUsd(s.unhedged)} (limit {formatUsd(c.maxUnhedged)}, enforced on Solana)</div>
          </div>
          <div>
            <div className="mb-1 font-medium">Protection purchases</div>
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-left text-xs">
                <thead className="text-muted">
                  <tr><th className="px-3 py-2">Gemini order</th><th className="px-3 py-2">Contracts</th><th className="px-3 py-2">Price</th><th className="px-3 py-2">Recorded</th></tr>
                </thead>
                <tbody className="tabular divide-y divide-line">
                  {s.fills.map((f) => (
                    <tr key={f.id}>
                      <td className="px-3 py-2"><code>{f.orderId}</code></td>
                      <td className="px-3 py-2">{f.contracts}</td>
                      <td className="px-3 py-2">${microsToPrice(BigInt(f.priceMicros))}</td>
                      <td className="px-3 py-2">{f.recordTx ? <a className="text-brand underline" href={tx(f.recordTx)} target="_blank" rel="noreferrer">on Solana</a> : f.status}</td>
                    </tr>
                  ))}
                  {s.fills.length === 0 ? <tr><td colSpan={4} className="px-3 py-3 text-muted">None yet — they appear seconds after each order.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <div className="mb-1 font-medium">Activity</div>
            <div className="max-h-80 divide-y divide-line overflow-y-auto rounded-xl border border-line">
              {s.events.map((e) => (
                <div key={`${e.signature}:${e.index}`} className="flex items-center gap-2 px-3 py-2 text-xs">
                  <span className="flex-1">{EVENT_LABEL[e.name]?.(e) ?? e.name}</span>
                  <a className="text-muted underline" href={tx(e.signature)} target="_blank" rel="noreferrer">view</a>
                </div>
              ))}
              {s.events.length === 0 ? <div className="px-3 py-3 text-xs text-muted">No activity yet.</div> : null}
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="t-small text-muted">{label}</div>
      <div className="t-score mt-1 text-[2rem] sm:text-[2.5rem]">{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-subtle">{sub}</div> : null}
    </div>
  );
}

const SOURCE_LABEL: Record<StoredEvent['source'], string> = {
  quicknode: 'via QuickNode Streams',
  ws: 'via Solana websocket',
  backfill: 'via chain re-check',
};

/** Seconds, one decimal under 10 s ("1.4 s", "12 s"). Never negative (block times are whole seconds). */
const secs = (ms: number) => {
  const v = Math.max(0, ms) / 1000;
  return v < 10 ? `${v.toFixed(1)} s` : `${Math.round(v)} s`;
};

type Step = { at: number; label: string; detail: string; Icon: typeof Wallet };

/**
 * The path one sale takes, with real timings: paid on Solana → delivered to our engine (QuickNode Streams) →
 * protection bought on Gemini → protection recorded on Solana. Built from the engine's stored events and fills.
 */
function salePath(sale: StoredEvent, events: StoredEvent[], fills: HedgeFill[]): { steps: Step[]; total: number | null } {
  const paidAt = (sale.blockTime ?? Math.floor(sale.receivedAt / 1000)) * 1000;
  const steps: Step[] = [{ at: paidAt, label: 'Paid on Solana', detail: `Order #${orderNumber(sale.signature)}`, Icon: Wallet }];
  steps.push({ at: sale.receivedAt, label: sale.source === 'quicknode' ? 'Delivered by QuickNode Streams' : 'Seen by our engine', detail: sale.source === 'quicknode' ? 'Signed webhook, checked by our engine' : SOURCE_LABEL[sale.source], Icon: Radio });
  const fill = [...fills].sort((a, b) => a.createdAt - b.createdAt).find((f) => f.createdAt >= sale.receivedAt - 2_000);
  if (!fill) return { steps, total: null };
  steps.push({ at: fill.createdAt, label: 'Protection bought on Gemini', detail: `${fill.contracts} × $1 contract${fill.contracts === 1 ? '' : 's'} at $${microsToPrice(BigInt(fill.priceMicros))}`, Icon: ShieldCheck });
  const recorded = events
    .filter((e) => e.name === 'hedgeRecorded' && e.receivedAt >= fill.createdAt - 2_000)
    .sort((a, b) => a.receivedAt - b.receivedAt)[0];
  const recordedAt = recorded ? Math.max((recorded.blockTime ?? 0) * 1000, fill.createdAt) : fill.status === 'recorded' ? fill.updatedAt : null;
  if (recordedAt) steps.push({ at: recordedAt, label: 'Protection recorded on Solana', detail: 'Coverage is now public', Icon: Waypoints });
  return { steps, total: recordedAt ? recordedAt - paidAt : null };
}

function SalePipeline({ events, fills, simulated }: { events: StoredEvent[]; fills: HedgeFill[]; simulated: boolean }) {
  const sales = events.filter((e) => e.name === 'purchaseEvent').sort((a, b) => b.receivedAt - a.receivedAt);
  if (!sales.length) return null;
  const latest = salePath(sales[0]!, events, fills);
  const totals = sales.slice(0, 20).map((e) => salePath(e, events, fills).total).filter((t): t is number => t !== null).sort((a, b) => a - b);
  const median = totals.length ? totals[Math.floor((totals.length - 1) / 2)]! : null;
  const t0 = latest.steps[0]!.at;
  return (
    <section className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="t-h3">From payment to protection</h2>
        {median !== null ? (
          <span className="text-sm text-muted">
            Typically <b className="text-ink">{secs(median)}</b>{totals.length > 1 ? ` across ${totals.length} orders` : ''}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-muted">The latest order, step by step{simulated ? ' (practice game: the Gemini step is simulated)' : ''}.</p>
      <ol className="mt-4 grid gap-3 sm:grid-cols-4">
        {latest.steps.map(({ at, label, detail, Icon }, i) => (
          <li key={label} className="relative rounded-xl bg-paper p-3.5">
            <div className="flex items-center justify-between">
              <Icon className="h-5 w-5 text-brand" aria-hidden="true" />
              <span className="tabular text-xs font-bold text-subtle">{i === 0 ? 'start' : `+${secs(at - t0)}`}</span>
            </div>
            <div className="mt-2 text-sm font-bold leading-snug">{label}</div>
            <div className="mt-0.5 text-xs text-muted">{detail}</div>
          </li>
        ))}
        {latest.steps.length < 4 ? (
          <li className="rounded-xl border border-dashed border-line-strong p-3.5 text-xs text-muted sm:col-span-1">Protection is on its way. It usually lands within seconds.</li>
        ) : null}
      </ol>
      <p className="mt-3 text-xs text-subtle">Solana block times are whole seconds, so these timings are approximate.</p>
    </section>
  );
}
