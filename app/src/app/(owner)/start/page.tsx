'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { formatUsd, parseUsd } from '@oth/shared';
import type { MarketSummary, ShopItem } from '@oth/shared/api';
import { GameCard } from '@/components/GameCard';
import { Qr } from '@/components/Qr';
import { engine } from '@/lib/client';
import { gameFor, startsIn } from '@/lib/game';
import { useOwner } from '@/lib/owner';
import {
  cents,
  costBps,
  DEFAULT_ITEMS,
  isPracticeGame,
  practiceGames,
  defaultMaxCostPct,
  launchPromo,
  loadShop,
  offerText,
  pickNextGame,
  saveShop,
  suggestedRefundPct,
  tradable,
} from '@/lib/shop';

type Step = 'shop' | 'promo' | 'live';
const OFFERS = [100, 50, 25];

export default function StartPage() {
  const owner = useOwner();
  const [step, setStep] = useState<Step>('shop');
  const [name, setName] = useState('');
  const [items, setItems] = useState<ShopItem[]>(DEFAULT_ITEMS);
  const [loadedShop, setLoadedShop] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [campaign, setCampaign] = useState<string | null>(null);

  // Prefill from a saved shop; returning owners skip straight to the promo.
  useEffect(() => {
    if (!owner.address || loadedShop) return;
    void loadShop(owner.address).then((s) => {
      if (s) {
        setName(s.name);
        setItems(s.items);
        setStep('promo');
      }
      setLoadedShop(true);
    });
  }, [owner.address, loadedShop]);

  if (!owner.ready) return <Centered>Loading…</Centered>;

  if (owner.mode === 'privy' && !owner.authenticated) {
    return (
      <Shell step={1}>
        <h1 className="text-2xl font-bold">Start your promo</h1>
        <p className="mt-2 text-muted">Sign in to set up your shop. No crypto, no passwords — just your email or Google.</p>
        <button onClick={owner.login} className="mt-6 w-full rounded-xl bg-brand py-3.5 font-semibold text-white">
          Continue with email or Google
        </button>
        <p className="mt-3 text-center text-xs text-muted">We create a secure account behind the scenes that only you control.</p>
      </Shell>
    );
  }

  if (step === 'shop') {
    return (
      <Shell step={1}>
        <h1 className="text-2xl font-bold">Your shop</h1>
        <p className="mt-1 text-sm text-muted">This is what customers see on your promo page.</p>
        <label className="mt-5 block text-sm font-medium">
          Shop name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Bean There Café"
            className="mt-1 w-full rounded-xl border border-line bg-card px-3 py-3 text-base"
            autoFocus
          />
        </label>
        <MenuEditor items={items} onChange={setItems} />
        {error ? <p className="mt-3 text-sm text-warn">{error}</p> : null}
        <button
          disabled={busy || !name.trim() || !items.length}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await saveShop(owner, name.trim(), items);
              setStep('promo');
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
          className="mt-6 w-full rounded-xl bg-brand py-3.5 font-semibold text-white disabled:opacity-40"
        >
          {busy ? 'Saving…' : 'Continue'}
        </button>
      </Shell>
    );
  }

  if (step === 'promo') {
    return (
      <PromoStep
        shopName={name}
        items={items}
        onEditShop={() => setStep('shop')}
        onLaunched={(c) => {
          setCampaign(c);
          setStep('live');
        }}
      />
    );
  }

  return <LiveStep campaign={campaign!} shopName={name} />;
}

// ---------------------------------------------------------------------------------------------

function PromoStep({ shopName, items, onEditShop, onLaunched }: { shopName: string; items: ShopItem[]; onEditShop: () => void; onLaunched: (c: string) => void }) {
  const owner = useOwner();
  const [markets, setMarkets] = useState<MarketSummary[] | null>(null);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [symbol, setSymbol] = useState<string | null>(null);
  const [refundPct, setRefundPct] = useState<number | null>(null);
  const [showGames, setShowGames] = useState(false);
  const [maxCostPct, setMaxCostPct] = useState<number | null>(null);
  const [capUsd, setCapUsd] = useState(200);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    engine<{ markets: MarketSummary[] }>('/markets?limit=500')
      .then((r) => {
        setMarkets(r.markets);
        setMarketError(null);
      })
      .catch((e) => setMarketError((e as Error).message));
  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 20_000);
    return () => clearInterval(t);
  }, []);

  const real = useMemo(() => (markets ? tradable(markets).slice(0, 12) : []), [markets]);
  const practice = useMemo(() => (markets ? practiceGames(markets) : []), [markets]);
  // Real Gemini games first; practice games only when none can be protected right now.
  const options = real.length ? real : practice;
  const suggested = useMemo(() => (markets ? (pickNextGame(markets) ?? practiceGames(markets)[0] ?? null) : null), [markets]);
  const market = options.find((m) => m.symbol === symbol) ?? suggested;
  const game = gameFor(market);
  const pct = refundPct ?? (market?.yesAsk ? suggestedRefundPct(market.yesAsk) : 100);
  const cost = market?.yesAsk ? costBps(pct, market.yesAsk) : null;
  const maxCost = maxCostPct ?? (market?.yesAsk ? defaultMaxCostPct(pct, market.yesAsk) : null);
  const typical = items.length ? [...items].sort((a, b) => Number(BigInt(a.price) - BigInt(b.price)))[Math.floor((items.length - 1) / 2)]! : null;
  const costOnTypical = typical && cost !== null ? (BigInt(typical.price) * BigInt(cost)) / 10_000n : null;
  const tooExpensive = cost !== null && cost > 9_000;

  if (marketError) return <Shell step={2}><p className="text-warn">We couldn’t load today’s games. Please refresh in a moment.</p></Shell>;
  if (!markets) return <Shell step={2}><p className="text-muted">Finding the next game…</p></Shell>;
  if (!market || !game) {
    return (
      <Shell step={2}>
        <h1 className="text-2xl font-bold">No games open right now</h1>
        <p className="mt-2 text-sm text-muted">
          Live prices on Gemini’s test market come and go — new games usually open within a few minutes. We’ll keep checking.
        </p>
        <button onClick={() => void refresh()} className="mt-5 w-full rounded-xl border border-line py-3 font-medium">Check again</button>
        <button onClick={onEditShop} className="mt-3 w-full text-center text-sm text-muted underline">Edit my shop meanwhile</button>
        <Link href="/dashboard" className="mt-2 block text-center text-sm text-muted underline">Go to my promos</Link>
      </Shell>
    );
  }

  async function launch() {
    if (!market) return;
    setBusy(true);
    setError(null);
    try {
      const minutesLeft = market.closesAt ? Math.floor((Date.parse(market.closesAt) - Date.now()) / 60_000) : 24 * 60;
      const { campaign } = await launchPromo(owner, {
        marketSymbol: market.symbol,
        refundPct: pct,
        maxCostPct: maxCost ?? 100,
        liabilityCapUsd: capUsd,
        maxUnhedgedUsd: Math.min(25, capUsd),
        deadlineMinutes: Math.max(1, minutesLeft),
      });
      onLaunched(campaign);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell step={2}>
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Your promo</h1>
        <button onClick={onEditShop} className="text-sm text-muted underline">{shopName || 'Edit shop'}</button>
      </div>

      {isPracticeGame(market) ? (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
          <div className="font-semibold text-amber-900">No live Gemini games right now — this is a practice game</div>
          <div className="mt-0.5 text-amber-900/80">
            Everything works the same: real sales and refunds on Solana. Only the protection and the result are SIMULATED.
            Real games show up here automatically when Gemini has prices.
          </div>
        </div>
      ) : null}
      <div className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted">
        {isPracticeGame(market) ? 'Practice game' : symbol ? 'Your game' : 'Next game'} · final {startsIn(market.closesAt)}
      </div>
      <div className="mt-2">
        <GameCard game={game} offer={offerText(pct)} />
      </div>
      <button onClick={() => setShowGames((v) => !v)} className="mt-2 text-sm text-brand underline">
        {showGames ? 'Hide other games' : 'Pick a different game'}
      </button>
      {showGames ? (
        <div className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
          {options.map((m) => {
            const g = gameFor(m)!;
            return (
              <button
                key={m.symbol}
                onClick={() => {
                  setSymbol(m.symbol);
                  setRefundPct(null);
                  setMaxCostPct(null);
                  setShowGames(false);
                }}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm ${m.symbol === market.symbol ? 'bg-brand-soft' : ''}`}
              >
                <span>{g.emoji}</span>
                <span className="flex-1">{g.matchup}</span>
                <span className="text-xs text-muted">{g.finalAt}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="mt-5 text-sm font-medium">Your offer if {game.team} wins</div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {OFFERS.map((o) => (
          <button
            key={o}
            onClick={() => {
              setRefundPct(o);
              setMaxCostPct(null);
            }}
            className={`rounded-xl border px-2 py-2.5 text-sm font-medium ${o === pct ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-card'}`}
          >
            {o === 100 ? 'Free' : `${o}% back`}
          </button>
        ))}
      </div>

      <div className={`mt-5 rounded-2xl p-4 ${tooExpensive ? 'bg-warn-soft' : 'bg-brand-soft'}`}>
        <div className="text-sm">
          You pay <b className="tabular text-lg">{cost !== null ? `${(cost / 100).toFixed(cost % 100 ? 1 : 0)}%` : '—'}</b> of each sale
          {costOnTypical !== null && typical ? (
            <> — that’s <b className="tabular">{formatUsd(cents(costOnTypical))}</b> on a {formatUsd(typical.price)} {typical.name.toLowerCase()}</>
          ) : null}
          .
        </div>
        <div className="mt-1 text-xs text-muted">
          Same cost whether {game.team} wins or loses. If {game.team} wins, refunds are covered by us — not you.
        </div>
        {tooExpensive ? <div className="mt-2 text-sm text-warn">This game is a near-sure win, so “{offerText(pct).toLowerCase()}” is expensive. Try a smaller offer or another game.</div> : null}
      </div>

      <details className="mt-4 rounded-xl border border-line bg-card px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium">Limits (optional)</summary>
        <div className="mt-3 space-y-3">
          <label className="block">
            Most I’ll pay per sale: <b>{maxCost}%</b>
            <input type="range" min={Math.max(1, Math.ceil((cost ?? 100) / 100))} max={100} value={maxCost ?? 100} onChange={(e) => setMaxCostPct(Number(e.target.value))} className="w-full" />
            <span className="text-xs text-muted">If prices rise above this, sales pause until they come back.</span>
          </label>
          <label className="block">
            Most refunds in total: <b>{formatUsd(parseUsd(String(capUsd)))}</b>
            <input type="range" min={25} max={1000} step={25} value={capUsd} onChange={(e) => setCapUsd(Number(e.target.value))} className="w-full" />
            <span className="text-xs text-muted">The promo stops selling once this much could be refunded.</span>
          </label>
          <p className="text-xs text-muted">Sales close automatically shortly before the game ends.</p>
        </div>
      </details>

      {error ? <p className="mt-3 text-sm text-warn">{error}</p> : null}
      <button onClick={() => void launch()} disabled={busy || tooExpensive || cost === null} className="mt-5 w-full rounded-xl bg-brand py-3.5 font-semibold text-white disabled:opacity-40">
        {busy ? 'Launching…' : 'Launch promo'}
      </button>
      {market.simulated || isPracticeGame(market) ? <p className="mt-2 text-center text-xs text-muted">SIMULATED · practice game</p> : null}
    </Shell>
  );
}

// ---------------------------------------------------------------------------------------------

function LiveStep({ campaign, shopName }: { campaign: string; shopName: string }) {
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => setOrigin(window.location.origin), []);
  const link = `${origin}/p/${campaign}`;
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;
  return (
    <Shell step={3}>
      <div className="text-center">
        <div className="text-4xl">🎉</div>
        <h1 className="mt-2 text-2xl font-bold">You’re live!</h1>
        <p className="mt-1 text-sm text-muted">Share this link or put the QR code on your counter.</p>
      </div>
      <div className="mt-5 flex justify-center">{origin ? <Qr value={link} size={200} /> : null}</div>
      <div className="mt-4 flex items-center gap-2 rounded-xl border border-line bg-card p-2">
        <code className="min-w-0 flex-1 truncate px-2 text-sm">{link.replace(/^https?:\/\//, '')}</code>
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(link).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white"
        >
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {canShare ? (
          <button onClick={() => void navigator.share({ title: shopName, text: `Game-day promo at ${shopName}`, url: link }).catch(() => {})} className="rounded-xl border border-line bg-card py-3 text-sm font-medium">
            Share…
          </button>
        ) : null}
        <Link href={`/p/${campaign}/print`} target="_blank" className={`rounded-xl border border-line bg-card py-3 text-center text-sm font-medium ${canShare ? '' : 'col-span-2'}`}>
          Print counter sign
        </Link>
      </div>
      <Link href={`/p/${campaign}`} className="mt-3 block rounded-xl bg-brand py-3.5 text-center font-semibold text-white">See what customers see</Link>
      <Link href="/dashboard" className="mt-3 block text-center text-sm text-muted underline">Go to my promos</Link>
    </Shell>
  );
}

// ---------------------------------------------------------------------------------------------

function MenuEditor({ items, onChange }: { items: ShopItem[]; onChange: (i: ShopItem[]) => void }) {
  const update = (idx: number, patch: Partial<{ name: string; price: string }>) =>
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  return (
    <div className="mt-5">
      <div className="text-sm font-medium">Menu</div>
      <div className="mt-2 space-y-2">
        {items.map((it, i) => (
          <div key={it.id} className="flex items-center gap-2">
            <input
              value={it.name}
              onChange={(e) => update(i, { name: e.target.value })}
              placeholder="Item"
              className="min-w-0 flex-1 rounded-xl border border-line bg-card px-3 py-2.5"
            />
            <PriceInput price={it.price} label={`${it.name} price`} onPrice={(price) => update(i, { price })} />
            <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="px-2 text-xl text-muted" aria-label={`Remove ${it.name}`}>
              ×
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={() => onChange([...items, { id: `item-${Date.now()}`, name: '', price: '3000000' }])}
        className="mt-2 text-sm text-brand underline"
      >
        + Add item
      </button>
    </div>
  );
}

/** Keeps the typed text (so "4." survives) and reports a parsed price whenever it's valid. */
function PriceInput({ price, label, onPrice }: { price: string; label: string; onPrice: (p: string) => void }) {
  const [text, setText] = useState(() => (Number(price) / 1e6).toFixed(2));
  return (
    <div className="flex items-center rounded-xl border border-line bg-card px-2">
      <span className="text-muted">$</span>
      <input
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          const v = e.target.value.replace(/[^\d.]/g, '');
          setText(v);
          try {
            if (v) onPrice(parseUsd(v).toString());
          } catch {
            /* partial input like "4." — keep typing */
          }
        }}
        className="w-16 bg-transparent py-2.5 text-right"
        aria-label={label}
      />
    </div>
  );
}

function Shell({ step, children }: { step: 1 | 2 | 3; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md pb-10">
      <div className="mb-5 flex items-center gap-2" aria-label={`Step ${step} of 3`}>
        {[1, 2, 3].map((s) => (
          <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? 'bg-brand' : 'bg-line'}`} />
        ))}
      </div>
      {children}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="py-20 text-center text-muted">{children}</div>;
}
