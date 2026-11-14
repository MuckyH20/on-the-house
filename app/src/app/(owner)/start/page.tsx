'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { formatUsd, parseUsd } from '@oth/shared';
import type { MarketSummary, ShopItem } from '@oth/shared/api';
import { GameCard, TeamMark } from '@/components/GameCard';
import { Badge, Button, ButtonLink, EmptyState, Eyebrow, Field, Notice, PageSkeleton, Simulated, Skeleton, SuccessBurst } from '@/components/ui';
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
  salesUntil,
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

  if (!owner.ready) return <PageSkeleton cards={2} />;

  if (owner.mode === 'privy' && !owner.authenticated) {
    return (
      <Shell step={1}>
        <Eyebrow>Step 1 of 3</Eyebrow>
        <h1 className="t-h1 mt-2">Start your promo</h1>
        <p className="t-body mt-2 text-muted">Sign in to set up your shop. No crypto, no passwords — just your email or Google.</p>
        <Button onClick={owner.login} variant="secondary" size="lg" block className="mt-7">
          <GoogleG /> Continue with Google or email
        </Button>
        <p className="mt-3 text-center text-xs text-subtle">We create a secure account behind the scenes that only you control.</p>
      </Shell>
    );
  }

  if (step === 'shop') {
    return (
      <Shell step={1}>
        <Eyebrow>Step 1 of 3</Eyebrow>
        <h1 className="t-h1 mt-2">Your shop</h1>
        <p className="t-body mt-2 text-muted">This is what customers see on your promo page.</p>
        <div className="mt-6">
          <Field label="Shop name">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bean There Café" className="input" autoFocus />
          </Field>
        </div>
        <MenuEditor items={items} onChange={setItems} />
        {error ? <Notice tone="error" className="mt-4">{error}</Notice> : null}
        <Button
          size="lg"
          block
          loading={busy}
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
          className="mt-7"
        >
          {busy ? 'Saving…' : 'Continue'}
        </Button>
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

  if (marketError) return <Shell step={2}><Notice tone="error">We couldn’t load today’s games. Please refresh in a moment.</Notice></Shell>;
  if (!markets)
    return (
      <Shell step={2}>
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="mt-6 h-44 w-full rounded-2xl" />
        <Skeleton className="mt-4 h-11 w-full" />
        <Skeleton className="mt-4 h-20 w-full rounded-2xl" />
      </Shell>
    );
  if (!market || !game) {
    return (
      <Shell step={2}>
        <EmptyState
          icon="⏳"
          title="No games open right now"
          body="Live prices on Gemini’s test market come and go — new games usually open within a few minutes. We’ll keep checking."
          action={<Button variant="secondary" onClick={() => void refresh()}>Check again</Button>}
        />
        <div className="mt-4 flex justify-center gap-4 text-sm">
          <button onClick={onEditShop} className="link-muted">Edit my shop</button>
          <Link href="/dashboard" className="link-muted">Go to my promos</Link>
        </div>
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
      <div className="flex items-center justify-between gap-3">
        <Eyebrow>Step 2 of 3</Eyebrow>
        <button onClick={onEditShop} className="btn btn-ghost btn-sm -my-2 -mr-2 max-w-[60%] truncate">{shopName || 'Edit shop'} ✎</button>
      </div>
      <h1 className="t-h1 mt-2">Your promo</h1>

      {isPracticeGame(market) ? (
        <div className="notice notice-caution mt-5">
          <div className="font-semibold">No live Gemini games right now — this is a practice game</div>
          <div className="mt-0.5 opacity-90">
            Everything works the same: real sales and refunds on Solana. Only the protection and the result are SIMULATED.
            Real games show up here automatically when Gemini has prices.
          </div>
        </div>
      ) : null}
      <div className="mt-6 flex items-center justify-between gap-2">
        <span className="t-label text-subtle">{isPracticeGame(market) ? 'Practice game' : symbol ? 'Your game' : 'Next game'}</span>
        {salesUntil(market.closesAt) ? <Badge tone="neutral">Selling until {salesUntil(market.closesAt)}</Badge> : null}
      </div>
      <div className="mt-2">
        <GameCard game={game} offer={offerText(pct)} chance={market.yesAsk ? Number(market.yesAsk) : null} />
      </div>
      <button onClick={() => setShowGames((v) => !v)} className="link mt-3 text-sm">
        {showGames ? 'Hide other games' : 'Pick a different game'}
      </button>
      {showGames ? (
        <div className="card mt-2 divide-y divide-line overflow-hidden p-0">
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
                className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-paper ${m.symbol === market.symbol ? 'bg-brand-soft' : ''}`}
              >
                <TeamMark game={g} size={28} />
                <span className="flex-1 font-medium">{g.matchup}</span>
                {m.yesAsk ? <span className="tabular text-xs font-semibold">{Math.round(Number(m.yesAsk) * 100)}%</span> : null}
                <span className="text-xs text-subtle">{g.finalAt}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="field-label mt-7">Your offer if {game.team} wins</div>
      <div className="grid grid-cols-3 gap-2">
        {OFFERS.map((o) => (
          <button
            key={o}
            onClick={() => {
              setRefundPct(o);
              setMaxCostPct(null);
            }}
            aria-pressed={o === pct}
            className="choice"
          >
            {o === 100 ? 'Free' : `${o}% back`}
          </button>
        ))}
      </div>

      <div className={`mt-6 rounded-2xl p-5 ${tooExpensive ? 'bg-warn-soft' : 'bg-brand-soft'}`}>
        <div className="t-label text-brand-strong">Your cost</div>
        <div className="mt-1.5 text-[0.9375rem] leading-relaxed">
          You pay <b className="tabular text-2xl font-extrabold tracking-tight">{cost !== null ? `${(cost / 100).toFixed(cost % 100 ? 1 : 0)}%` : '—'}</b> of each sale
          {costOnTypical !== null && typical ? (
            <> — that’s <b className="tabular">{formatUsd(cents(costOnTypical))}</b> on a {formatUsd(typical.price)} {typical.name.toLowerCase()}</>
          ) : null}
          .
        </div>
        <div className="mt-2 text-xs text-muted">
          Same cost whether {game.team} wins or loses. If {game.team} wins, refunds are covered by us — not you.
        </div>
        {tooExpensive ? <div className="mt-2 text-sm text-warn">This game is a near-sure win, so “{offerText(pct).toLowerCase()}” is expensive. Try a smaller offer or another game.</div> : null}
      </div>

      <details className="card group mt-4 px-4 py-3 text-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between font-medium">
          Limits (optional)
          <span className="text-muted transition-transform group-open:rotate-180" aria-hidden="true">⌄</span>
        </summary>
        <div className="mt-4 space-y-5">
          <label className="block">
            Most I’ll pay per sale: <b>{maxCost}%</b>
            <input type="range" min={Math.max(1, Math.ceil((cost ?? 100) / 100))} max={100} value={maxCost ?? 100} onChange={(e) => setMaxCostPct(Number(e.target.value))} className="mt-2 w-full accent-[var(--color-brand)]" />
            <span className="field-help block">If prices rise above this, sales pause until they come back.</span>
          </label>
          <label className="block">
            Most refunds in total: <b>{formatUsd(parseUsd(String(capUsd)))}</b>
            <input type="range" min={25} max={1000} step={25} value={capUsd} onChange={(e) => setCapUsd(Number(e.target.value))} className="mt-2 w-full accent-[var(--color-brand)]" />
            <span className="field-help block">The promo stops selling once this much could be refunded.</span>
          </label>
          <p className="text-xs text-muted">Sales stop automatically 12 minutes before the final, so every order can be protected.</p>
        </div>
      </details>

      {error ? <Notice tone="error" className="mt-4">{error}</Notice> : null}
      <Button onClick={() => void launch()} disabled={tooExpensive || cost === null} loading={busy} size="lg" block className="mt-6">
        {busy ? 'Launching…' : 'Launch promo'}
      </Button>
      {market.simulated || isPracticeGame(market) ? <div className="mt-3 text-center"><Simulated label="SIMULATED · practice game" /></div> : null}
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
        <SuccessBurst />
        <h1 className="t-h1 mt-5">You’re live!</h1>
        <p className="t-body mt-1.5 text-muted">Share this link or put the QR code on your counter.</p>
      </div>
      <div className="mt-6 flex justify-center">{origin ? <Qr value={link} size={208} className="border border-line shadow-[var(--shadow-card)]" /> : <Skeleton className="h-52 w-52" />}</div>
      <div className="card mt-5 flex items-center gap-2 p-1.5">
        <code className="min-w-0 flex-1 truncate px-3 font-mono text-sm text-muted">{link.replace(/^https?:\/\//, '')}</code>
        <Button
          size="sm"
          variant="dark"
          onClick={async () => {
            await navigator.clipboard.writeText(link).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? 'Copied ✓' : 'Copy'}
        </Button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {canShare ? (
          <Button variant="secondary" onClick={() => void navigator.share({ title: shopName, text: `Game-day promo at ${shopName}`, url: link }).catch(() => {})}>
            Share…
          </Button>
        ) : null}
        <ButtonLink href={`/p/${campaign}/print`} target="_blank" variant="secondary" className={canShare ? '' : 'col-span-2'}>
          Print counter sign
        </ButtonLink>
      </div>
      <div className="card mt-6 p-5">
        <div className="t-h3">What happens next</div>
        <ol className="mt-3 space-y-3 text-sm text-muted">
          {[
            ['Put the sign on your counter', '(or share the link).'],
            ['Customers scan, order and pay', 'on their phone — they get an order number.'],
            ['Keep the Orders screen open', 'and hand over each order by its number.'],
            ['After the final,', 'refunds (if any) are paid automatically. Nothing for you to do.'],
          ].map(([b, rest], i) => (
            <li key={b} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand">{i + 1}</span>
              <span className="pt-0.5"><b className="text-ink">{b}</b> {rest}</span>
            </li>
          ))}
        </ol>
      </div>
      <ButtonLink href={`/orders/${campaign}`} variant="dark" size="lg" block className="mt-5">Open the Orders screen</ButtonLink>
      <ButtonLink href={`/p/${campaign}`} variant="secondary" block className="mt-3">See what customers see</ButtonLink>
      <div className="mt-4 text-center"><Link href="/dashboard" className="link-muted text-sm">Go to my promos</Link></div>
    </Shell>
  );
}

// ---------------------------------------------------------------------------------------------

function MenuEditor({ items, onChange }: { items: ShopItem[]; onChange: (i: ShopItem[]) => void }) {
  const update = (idx: number, patch: Partial<{ name: string; price: string }>) =>
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  return (
    <div className="mt-6">
      <div className="field-label">Menu</div>
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={it.id} className="flex items-center gap-2">
            <input
              value={it.name}
              onChange={(e) => update(i, { name: e.target.value })}
              placeholder="Item"
              aria-label="Item name"
              className="input min-w-0 flex-1"
            />
            <PriceInput price={it.price} label={`${it.name} price`} onPrice={(price) => update(i, { price })} />
            <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="btn btn-ghost h-12 w-10 px-0 text-xl" aria-label={`Remove ${it.name}`}>
              ×
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={() => onChange([...items, { id: `item-${Date.now()}`, name: '', price: '3000000' }])}
        className="link mt-3 text-sm"
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
    <div className="input flex w-28 shrink-0 items-center gap-1 px-3 focus-within:border-brand focus-within:shadow-[0_0_0_3px_rgb(194_65_12/0.18)]">
      <span className="text-subtle">$</span>
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
        className="tabular w-full bg-transparent text-right outline-none"
        aria-label={label}
      />
    </div>
  );
}

function Shell({ step, children }: { step: 1 | 2 | 3; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[480px] pb-6">
      <div className="mb-6 flex items-center gap-2" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step} aria-label={`Step ${step} of 3`}>
        {[1, 2, 3].map((s) => (
          <div key={s} className="step-dot" data-on={s <= step} />
        ))}
      </div>
      <div className="card animate-fade-up p-6 sm:p-8">{children}</div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="py-20 text-center text-muted">{children}</div>;
}

function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.7 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
      <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.8l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}
