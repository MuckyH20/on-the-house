'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { formatBps, formatUsd, premiumBpsFor, priceToMicros } from '@oth/shared';
import type { CampaignSummary, EngineInfo, MarketSummary } from '@oth/shared/api';
import { Button, Card, CampaignStatus, CoverageBar, Simulated } from '@/components/ui';
import { engine, getJson, usePoll } from '@/lib/client';

interface MarketsResponse {
  markets: MarketSummary[];
  total: number;
  categories: string[];
}

function closesIn(iso: string | null): string {
  if (!iso) return 'no fixed close';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms < 0) return 'closed';
  const m = Math.round(ms / 60_000);
  if (m < 60) return `closes in ${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `closes in ${h} h` : `closes ${new Date(iso).toLocaleDateString()}`;
}

export default function MerchantPage() {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [selected, setSelected] = useState<MarketSummary | null>(null);
  const [refundPct, setRefundPct] = useState(100);
  const [maxCostPct, setMaxCostPct] = useState<number | null>(null);
  const [capUsd, setCapUsd] = useState(200);
  const [unhedgedUsd, setUnhedgedUsd] = useState(20);
  const [deadlineMin, setDeadlineMin] = useState(60);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'good' | 'warn'; text: string; campaign?: string } | null>(null);

  const info = usePoll(() => engine<EngineInfo>('/health'), 30_000);
  const markets = usePoll(
    () => engine<MarketsResponse>(`/markets?limit=80${q ? `&q=${encodeURIComponent(q)}` : ''}${category ? `&category=${encodeURIComponent(category)}` : ''}`),
    15_000,
    [q, category],
  );
  const campaigns = usePoll(() => engine<{ campaigns: CampaignSummary[] }>('/campaigns'), 3_000);
  const margin = info.data?.platformMarginBps ?? 1000;

  const live = useMemo(
    () => (selected ? markets.data?.markets.find((m) => m.symbol === selected.symbol) ?? selected : null),
    [selected, markets.data],
  );
  const costBps = live?.yesAsk ? premiumBpsFor(Math.round(refundPct * 100), priceToMicros(live.yesAsk), margin) : null;

  // Default the budget to the live cost plus headroom so a small price move doesn't pause the promo.
  useEffect(() => {
    if (costBps !== null && maxCostPct === null) setMaxCostPct(Math.min(100, Math.ceil((costBps / 100) * 1.3)));
  }, [costBps, maxCostPct]);

  async function launch() {
    if (!live || maxCostPct === null) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await getJson<{ campaign: string }>('/api/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          marketSymbol: live.symbol,
          refundPct,
          maxCostPct,
          liabilityCapUsd: capUsd,
          maxUnhedgedUsd: unhedgedUsd,
          deadlineMinutes: deadlineMin,
        }),
      });
      setMsg({ tone: 'good', text: 'Promo launched!', campaign: res.campaign });
      void campaigns.refresh();
    } catch (e) {
      setMsg({ tone: 'warn', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const overBudget = costBps !== null && maxCostPct !== null && costBps > maxCostPct * 100;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold">Shop console</h1>
        <Simulated show={!!info.data?.simulated.gemini} label="SIMULATED HEDGING" />
        <Simulated show={!!info.data?.simulated.resolution} label="SIMULATED RESOLUTION" />
      </div>
      {info.error ? <Card className="border-warn text-sm text-warn">Engine not reachable ({info.error}). Start it with <code>pnpm dev:engine</code>.</Card> : null}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        {/* ---- 1. pick a market ---- */}
        <Card>
          <h2 className="font-semibold">1. Pick an event</h2>
          <div className="mt-3 flex gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search (e.g. BTC, Bears, snow)" className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border border-line px-2 text-sm">
              <option value="">All</option>
              {markets.data?.categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="mt-3 max-h-[420px] divide-y divide-line overflow-y-auto rounded-lg border border-line">
            {markets.data?.markets.map((m) => (
              <button key={m.symbol} onClick={() => { setSelected(m); setMaxCostPct(null); }}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-paper ${selected?.symbol === m.symbol ? 'bg-brand-soft' : ''}`}>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{m.title}</div>
                  <div className="text-xs text-muted">{m.category} · {closesIn(m.closesAt)} {m.simulated ? '· SIMULATED' : '· Gemini'}</div>
                </div>
                <div className="tabular text-right">
                  <div className="font-semibold">{m.yesAsk ? `${Math.round(Number(m.yesAsk) * 100)}%` : '—'}</div>
                  <div className="text-[10px] text-muted">chance</div>
                </div>
              </button>
            ))}
            {markets.data && markets.data.markets.length === 0 ? <div className="p-4 text-sm text-muted">No open markets match.</div> : null}
            {!markets.data ? <div className="p-4 text-sm text-muted">Loading markets…</div> : null}
          </div>
          {markets.data ? <div className="mt-2 text-xs text-muted">{markets.data.total} open markets · live prices from Gemini public data</div> : null}
        </Card>

        {/* ---- 2. set terms ---- */}
        <Card className="space-y-4">
          <h2 className="font-semibold">2. Set your promo</h2>
          {live ? (
            <div className="rounded-lg bg-paper p-3 text-sm">
              <div className="font-medium">{live.title}</div>
              <div className="text-muted">Customers get money back if <b>{live.condition}</b>.</div>
            </div>
          ) : <div className="text-sm text-muted">Pick an event on the left.</div>}

          <label className="block text-sm">Refund if it happens: <b>{refundPct}%</b> of the purchase
            <input type="range" min={5} max={100} step={5} value={refundPct} onChange={(e) => setRefundPct(Number(e.target.value))} className="w-full" />
          </label>

          <div className={`rounded-lg p-3 text-sm ${overBudget ? 'bg-warn-soft text-warn' : 'bg-brand-soft text-brand'}`}>
            {costBps !== null ? <>This promo costs you <b className="tabular text-base">{formatBps(costBps)}</b> of each sale right now.</> : 'Pick an event to see the cost.'}
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <label>Max cost per sale (%)
              <input type="number" min={0.5} max={100} step={0.5} value={maxCostPct ?? ''} onChange={(e) => setMaxCostPct(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-line px-2 py-1.5" />
            </label>
            <label>Sales window (minutes)
              <input type="number" min={1} value={deadlineMin} onChange={(e) => setDeadlineMin(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-line px-2 py-1.5" />
            </label>
            <label>Total refunds cap ($)
              <input type="number" min={1} value={capUsd} onChange={(e) => setCapUsd(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-line px-2 py-1.5" />
            </label>
            <label>Max uncovered at once ($)
              <input type="number" min={1} value={unhedgedUsd} onChange={(e) => setUnhedgedUsd(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-line px-2 py-1.5" />
            </label>
          </div>
          <p className="text-xs text-muted">If the price moves above your max cost, sales pause automatically until it comes back.</p>
          <Button onClick={launch} disabled={!live || busy || maxCostPct === null || overBudget} className="w-full">
            {busy ? 'Launching…' : 'Launch promo'}
          </Button>
          {msg ? (
            <div className={`text-sm ${msg.tone === 'good' ? 'text-good' : 'text-warn'}`}>
              {msg.text}{' '}
              {msg.campaign ? <><Link className="underline" href={`/shop/${msg.campaign}`}>Open the shop</Link> · <Link className="underline" href={`/proof/${msg.campaign}`}>Proof page</Link></> : null}
            </div>
          ) : null}
        </Card>
      </div>

      {/* ---- 3. campaigns ---- */}
      <section>
        <h2 className="mb-3 font-semibold">Your promos</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {campaigns.data?.campaigns.map(({ campaign: c, market, coverageBps, hedger, settlement }) => (
            <Card key={c.address} className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium">{market?.title ?? c.marketSymbol}</div>
                  <div className="text-xs text-muted">{c.refundBps / 100}% back · max cost {formatBps(c.maxPremiumBps)} · {c.purchaseCount} sales</div>
                </div>
                <CampaignStatus status={c.status} outcome={c.outcome} pausedByHedger={hedger.pausedByHedger} />
              </div>
              <div className="flex items-center gap-3 text-sm">
                <CoverageBar bps={coverageBps} />
                <span className="tabular w-14 text-right">{(coverageBps / 100).toFixed(0)}%</span>
              </div>
              <div className="tabular text-xs text-muted">
                promised {formatUsd(c.liability)} · covered {formatUsd(BigInt(c.hedgedContracts) * 1_000_000n)} · paid out {formatUsd(c.totalPaidOut)}
                {settlement.state !== 'waiting' && settlement.state !== 'done' ? ` · settling (${settlement.state})` : ''}
              </div>
              {hedger.lastError ? <div className="text-xs text-warn">{hedger.lastError}</div> : null}
              <div className="flex gap-3 text-sm">
                <Link className="text-brand underline" href={`/shop/${c.address}`}>Shop</Link>
                <Link className="text-brand underline" href={`/proof/${c.address}`}>Proof of coverage</Link>
              </div>
            </Card>
          ))}
          {campaigns.data?.campaigns.length === 0 ? <div className="text-sm text-muted">No promos yet.</div> : null}
        </div>
      </section>
    </div>
  );
}
