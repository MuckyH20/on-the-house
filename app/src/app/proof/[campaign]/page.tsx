'use client';

import { useParams } from 'next/navigation';
import { formatBps, formatUsd, microsToPrice } from '@oth/shared';
import type { CampaignState, StoredEvent } from '@oth/shared/api';
import { Card, CampaignStatus, CoverageBar, Simulated, Stat } from '@/components/ui';
import { short, useEngineStream } from '@/lib/client';

const tx = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
const addr = (a: string) => `https://explorer.solana.com/address/${a}?cluster=devnet`;

const EVENT_LABEL: Record<string, (e: StoredEvent) => string> = {
  campaignCreated: () => 'Promo created',
  purchaseEvent: (e) => `Sale ${formatUsd(String(e.data.amount))} → refund promised ${formatUsd(String(e.data.refund))}`,
  hedgeRecorded: (e) => `Coverage recorded: +${e.data.contractsAdded} contracts @ $${microsToPrice(BigInt(String(e.data.avgPriceMicros)))}`,
  campaignPauseChanged: (e) => (e.data.paused ? 'Sales paused' : 'Sales resumed'),
  campaignSettled: (e) => `Settled: ${String(e.data.outcome).toUpperCase()}`,
  payoutEvent: (e) => `Refund paid ${formatUsd(String(e.data.amount))} to ${short(String(e.data.customer))}`,
  claimsClosed: (e) => `Claims closed for ${short(String(e.data.customer))}`,
  campaignCancelled: () => 'Promo cancelled',
};

export default function ProofPage() {
  const { campaign } = useParams<{ campaign: string }>();
  const { data: s, live, error } = useEngineStream<CampaignState>(`/campaigns/${campaign}/stream`, `/campaigns/${campaign}/state`);

  if (!s) return <div className="text-sm text-muted">{error ? `Can’t load: ${error}` : 'Loading…'}</div>;
  const c = s.campaign;
  const anySim = s.simulated.gemini || s.simulated.resolution;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">Proof of coverage</h1>
          <CampaignStatus status={c.status} outcome={c.outcome} pausedByHedger={s.hedger.pausedByHedger} />
          <span className={`text-xs ${live ? 'text-good' : 'text-muted'}`}>{live ? '● live' : '○ polling'}</span>
        </div>
        <p className="text-sm text-muted">
          {c.refundBps / 100}% back if <b>{s.market?.condition ?? c.marketSymbol}</b>. Every refund promised on Solana is
          matched by prediction-market contracts that pay $1 each if it happens.
        </p>
        <div className="flex flex-wrap gap-2">
          <Simulated show={s.simulated.gemini} label="SIMULATED HEDGES (mock Gemini order book)" />
          <Simulated show={s.simulated.resolution} label="SIMULATED RESOLUTION" />
        </div>
      </div>

      <Card className="space-y-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Refunds promised" value={formatUsd(s.promised)} sub="on-chain liability" />
          <Stat label="Refunds covered" value={formatUsd(s.covered)} sub={`${c.hedgedContracts} contracts × $1`} />
          <Stat label="Coverage" value={`${(s.coverageBps / 100).toFixed(s.coverageBps % 100 ? 1 : 0)}%`} sub={`uncovered ${formatUsd(s.unhedged)} (max ${formatUsd(c.maxUnhedged)})`} />
          <Stat label="Refunds paid" value={formatUsd(c.totalPaidOut)} sub={c.status === 'settled' ? `outcome: ${c.outcome}` : `settlement: ${s.settlement.state}`} />
        </div>
        <CoverageBar bps={s.coverageBps} />
        <div className="grid gap-1 text-xs text-muted sm:grid-cols-2">
          <div>Market: <code>{c.marketSymbol}</code>{s.market?.yesAsk ? ` · YES ask $${s.market.yesAsk}` : ''}</div>
          <div>Sales: {c.purchaseCount} · {formatUsd(c.totalSales)} · shop’s max cost {formatBps(c.maxPremiumBps)}/sale</div>
          <div>Campaign account: <a className="underline" href={addr(c.address)} target="_blank" rel="noreferrer">{short(c.address, 6)}</a></div>
          <div>Hedger: {s.hedger.state}{s.hedger.pendingContracts ? ` · ${s.hedger.pendingContracts} pending` : ''} · max price ${microsToPrice(BigInt(s.hedger.maxPriceMicros))}</div>
        </div>
        {s.hedger.lastError ? <div className="rounded bg-warn-soft p-2 text-xs text-warn">{s.hedger.lastError}</div> : null}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 font-semibold">Hedge fills {anySim ? <Simulated show={s.simulated.gemini} /> : null}</h2>
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted">
                <tr><th className="px-3 py-2">Order</th><th className="px-3 py-2">Contracts</th><th className="px-3 py-2">Price</th><th className="px-3 py-2">On-chain</th></tr>
              </thead>
              <tbody className="tabular divide-y divide-line">
                {s.fills.map((f) => (
                  <tr key={f.id}>
                    <td className="px-3 py-2"><code className="text-xs">{f.orderId}</code></td>
                    <td className="px-3 py-2">{f.contracts}</td>
                    <td className="px-3 py-2">${microsToPrice(BigInt(f.priceMicros))}</td>
                    <td className="px-3 py-2">{f.recordTx ? <a className="text-brand underline" href={tx(f.recordTx)} target="_blank" rel="noreferrer">{f.status}</a> : f.status}</td>
                  </tr>
                ))}
                {s.fills.length === 0 ? <tr><td colSpan={4} className="px-3 py-4 text-muted">No fills yet — they appear seconds after each sale.</td></tr> : null}
              </tbody>
            </table>
          </Card>
        </section>
        <section>
          <h2 className="mb-2 font-semibold">On-chain activity</h2>
          <Card className="max-h-[420px] divide-y divide-line overflow-y-auto p-0 text-sm">
            {s.events.map((e) => (
              <div key={`${e.signature}:${e.index}`} className="flex items-center gap-2 px-3 py-2">
                <span className="flex-1">{EVENT_LABEL[e.name]?.(e) ?? e.name}</span>
                <a className="text-xs text-muted underline" href={tx(e.signature)} target="_blank" rel="noreferrer">tx</a>
              </div>
            ))}
            {s.events.length === 0 ? <div className="px-3 py-4 text-muted">No activity yet.</div> : null}
          </Card>
        </section>
      </div>
    </div>
  );
}
