'use client';

import { useParams } from 'next/navigation';
import { formatBps, formatUsd, microsToPrice } from '@oth/shared';
import type { CampaignState, StoredEvent } from '@oth/shared/api';
import { CoverageBar, Simulated } from '@/components/ui';
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

  if (!s) return <div className="py-20 text-center text-sm text-muted">{error ? `Can’t load this promo: ${error}` : 'Loading…'}</div>;
  const c = s.campaign;
  const game = gameFor(s.market);
  const fully = s.coverageBps >= 10_000;
  const outcome = c.status === 'settled' ? (c.outcome === 'yes' ? 'won' : 'lost') : null;

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-10">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">Protection details</h1>
          <span className={`text-xs ${live ? 'text-good' : 'text-muted'}`}>{live ? '● live' : '○ updating'}</span>
        </div>
        <p className="text-sm text-muted">
          {c.refundBps >= 10_000 ? 'Customers’ orders are free' : `Customers get ${c.refundBps / 100}% back`} if <b className="text-ink">{game?.condition ?? s.market?.condition ?? c.marketSymbol}</b>. Every refund promised to a
          customer is backed by a matching contract on Gemini that pays out if it happens.
        </p>
        <div className="flex flex-wrap gap-2">
          <Simulated show={s.simulated.gemini} label="SIMULATED protection (demo order book)" />
          <Simulated show={s.simulated.resolution} label="SIMULATED result" />
          {s.venue ? <span className="inline-flex items-center rounded border border-sky-300 bg-sky-50 px-1.5 py-0.5 text-[11px] font-bold text-sky-800">GEMINI TEST MARKET · TEST FUNDS</span> : null}
        </div>
      </header>

      <section className="space-y-4 rounded-2xl border border-line bg-card p-4">
        {outcome ? (
          <div className={`rounded-xl p-3 text-sm ${outcome === 'won' ? 'bg-good-soft text-good' : 'bg-paper'}`}>
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
          <div className="rounded-xl bg-paper p-3 text-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Gemini’s own records</div>
            <div className="mt-1 grid gap-1 sm:grid-cols-3">
              <div>Contracts held: <b className="tabular">{s.venue.positionContracts ?? '0'}</b></div>
              <div>Gemini’s result: <b>{s.venue.resolutionSide ? (s.venue.resolutionSide === 'yes' ? 'won' : 'lost') : 'not yet'}</b></div>
              <div>Gemini paid out: <b className="tabular">{s.venue.settledPayout != null ? `$${s.venue.settledPayout}` : '—'}</b></div>
            </div>
          </div>
        ) : null}
        {s.hedger.pausedByHedger ? <div className="rounded-xl bg-warn-soft p-3 text-sm text-warn">Sales are paused because protection got more expensive than the shop allowed. They resume automatically.</div> : null}
      </section>

      {(() => {
        const orders = s.events.filter((e) => e.name === 'purchaseEvent');
        if (!orders.length) return null;
        return (
          <section className="rounded-2xl border border-line bg-card p-4">
            <h2 className="text-sm font-semibold">Orders ({orders.length})</h2>
            <div className="mt-2 divide-y divide-line text-sm">
              {orders.slice(0, 20).map((e) => (
                <div key={`${e.signature}:${e.index}`} className="flex items-center gap-3 py-2">
                  <span className="font-mono font-semibold tracking-wider">#{orderNumber(e.signature)}</span>
                  <span className="tabular flex-1 text-muted">{formatUsd(String(e.data.amount))}</span>
                  <span className="text-xs text-muted">{e.blockTime ? new Date(e.blockTime * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'just now'}</span>
                </div>
              ))}
            </div>
          </section>
        );
      })()}

      <details className="rounded-2xl border border-line bg-card p-4">
        <summary className="cursor-pointer text-sm font-semibold">For the curious: the public record</summary>
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
      <div className="text-xs text-muted">{label}</div>
      <div className="tabular text-2xl font-semibold">{value}</div>
      {sub ? <div className="text-xs text-muted">{sub}</div> : null}
    </div>
  );
}
