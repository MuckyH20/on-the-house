'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { formatUsd, parseUsd } from '@oth/shared';
import type { MarketSummary, ShopItem } from '@oth/shared/api';
import { GameCard, TeamMark } from '@/components/GameCard';
import { Hourglass, MonitorSmartphone, Pencil, Plus, Printer, Smartphone, Trophy, X } from 'lucide-react';
import { playWhistle } from '@/lib/sound';
import { Badge, Button, ButtonLink, EmptyState, Field, Notice, PageSkeleton, Simulated, Skeleton, SuccessBurst } from '@/components/ui';
import { Qr } from '@/components/Qr';
import { engine } from '@/lib/client';
import { customerOffer, gameFor, startsIn, type Game } from '@/lib/game';
import { useOwner } from '@/lib/owner';
import { BackLink } from '@/components/BackLink';
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
      <Shell step={1} back={<BackLink href="/" />}>
        <h1 className="t-h1">Start your promo</h1>
        <p className="t-body mt-2 text-muted">Three quick steps, about two minutes. No crypto, no passwords: just your email or Google.</p>
        <ol className="mt-5 space-y-2.5">
          {STEP_NAMES.map((n, i) => (
            <li key={n} className="flex items-center gap-3 text-[0.9375rem]">
              <span className="t-score flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-night-deep text-base text-floodlight">{i + 1}</span>
              <span><b>{n}</b> <span className="text-muted">{STEP_HINTS[i]}</span></span>
            </li>
          ))}
        </ol>
        <Button onClick={owner.login} variant="secondary" size="lg" block className="mt-7">
          <GoogleG /> Continue with Google or email
        </Button>
        <p className="mt-3 text-center text-xs text-subtle">We create a secure account behind the scenes that only you control.</p>
      </Shell>
    );
  }

  if (step === 'shop') {
    return (
      <Shell step={1} back={<BackLink href="/" />} aside={<CustomerPreview shopName={name} items={items} />}>
        <h1 className="t-h1">Your shop</h1>
        <p className="t-body mt-2 text-muted">Your name and menu, as customers will see them on your promo page.</p>
        <div className="mt-6">
          <Field label="Shop name">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bean There Café" className="input" autoFocus />
          </Field>
        </div>
        <MenuEditor items={items} onChange={setItems} />
        <MobilePreview><CustomerPreview shopName={name} items={items} /></MobilePreview>
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

  const back = <BackLink onClick={onEditShop} label="Your shop" />;
  if (marketError) return <Shell step={2} back={back}><Notice tone="error">We couldn’t load today’s games. Please refresh in a moment.</Notice></Shell>;
  if (!markets)
    return (
      <Shell step={2} back={back}>
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="mt-6 h-44 w-full rounded-2xl" />
        <Skeleton className="mt-4 h-11 w-full" />
        <Skeleton className="mt-4 h-20 w-full rounded-2xl" />
      </Shell>
    );
  if (!market || !game) {
    return (
      <Shell step={2} back={back}>
        <EmptyState
          icon={Hourglass}
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
        // Refunds may sit uncovered for the second it takes to buy protection; $100 lets a big order through.
        maxUnhedgedUsd: Math.min(100, capUsd),
        deadlineMinutes: Math.max(1, minutesLeft),
      });
      onLaunched(campaign);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const preview = <CustomerPreview shopName={shopName} items={items} game={game} offer={customerOffer(pct)} chance={market.yesAsk ? Number(market.yesAsk) : null} />;
  return (
    <Shell step={2} back={back} aside={preview}>
      <div className="flex items-start justify-between gap-3">
        <h1 className="t-h1">Your promo</h1>
        <button onClick={onEditShop} className="btn btn-ghost btn-sm -mr-2 -mt-1 max-w-[55%]">
          <span className="truncate">{shopName || 'Edit shop'}</span>
          <Pencil className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        </button>
      </div>

      {isPracticeGame(market) ? (
        <div className="notice notice-caution mt-5">
          <div className="font-bold">No live games right now, so here’s a practice game</div>
          <div className="mt-0.5 opacity-90">
            Orders, payments and refunds work for real (with demo dollars). Only the game and its protection are
            simulated. Real games show up here on their own as soon as Gemini has prices.
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
          You pay <b className="t-score text-[2rem]">{cost !== null ? `${(cost / 100).toFixed(cost % 100 ? 1 : 0)}%` : '—'}</b> of each sale
          {costOnTypical !== null && typical ? (
            <> — that’s <b>{formatUsd(cents(costOnTypical))}</b> on a {formatUsd(typical.price)} {typical.name.toLowerCase()}</>
          ) : null}
          .
        </div>
        <div className="mt-2 text-xs text-muted">
          Only orders through your promo page. Same cost whether {game.team} wins or loses, and if {game.team} wins, the refunds are paid by us, not you.
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

      <MobilePreview>{preview}</MobilePreview>
      {error ? <Notice tone="error" className="mt-4">{error}</Notice> : null}
      <Button onClick={() => void launch()} disabled={tooExpensive || cost === null} loading={busy} size="lg" block className="mt-6">
        {busy ? 'Launching…' : (
          <>
            Launch promo
            {cost !== null ? <span className="font-normal opacity-80">· {(cost / 100).toFixed(cost % 100 ? 1 : 0)}% per sale</span> : null}
          </>
        )}
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
  useEffect(() => playWhistle(), []); // live: the whistle blows
  const link = `${origin}/p/${campaign}`;
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;
  return (
    <Shell step={3} back={<BackLink href="/dashboard" label="My promos" />}>
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
      {canShare ? (
        <Button variant="secondary" block className="mt-3" onClick={() => void navigator.share({ title: shopName, text: `Game-day promo at ${shopName}`, url: link }).catch(() => {})}>
          Share the link…
        </Button>
      ) : null}
      <h2 className="t-h2 mt-8">Get ready for game night</h2>
      <ol className="mt-4 divide-y divide-line border-y border-line">
        {[
          { icon: Printer, title: 'Put the sign on your counter', body: 'Or share the link. Customers scan, order and pay on their phone.', action: <ButtonLink href={`/p/${campaign}/print`} target="_blank" variant="secondary" size="sm">Print sign</ButtonLink> },
          { icon: MonitorSmartphone, title: 'Open Orders on your counter device', body: 'Each order shows up with a number. Hand it over, tap ready.', action: <ButtonLink href={`/orders/${campaign}`} variant="dark" size="sm">Open the Orders screen</ButtonLink> },
          { icon: Smartphone, title: 'Try a test order', body: 'See exactly what your customers see.', action: <ButtonLink href={`/p/${campaign}`} variant="secondary" size="sm">See what customers see</ButtonLink> },
          { icon: Trophy, title: 'After the final, nothing to do', body: 'If your team wins, refunds are paid automatically, by us.' },
        ].map(({ icon: Icon, title, body, action }) => (
          <li key={title} className="flex flex-wrap items-center gap-x-4 gap-y-3 py-4">
            <Icon className="h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
            <div className="min-w-0 flex-1 basis-48">
              <div className="font-bold">{title}</div>
              <p className="t-small text-muted">{body}</p>
            </div>
            {action ?? null}
          </li>
        ))}
      </ol>
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
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="field-label mb-0">Menu</div>
        <div className="flex flex-wrap items-center gap-1.5 text-sm" role="group" aria-label="Start from a menu">
          <span className="text-muted">Start from:</span>
          {Object.keys(MENU_PRESETS).map((k) => (
            <button key={k} type="button" onClick={() => onChange(MENU_PRESETS[k]!.map((it, i) => ({ ...it, id: `${k.toLowerCase()}-${i}-${Date.now()}` })))} className="rounded-full border border-line-strong px-2.5 py-1 font-bold transition-colors hover:border-brand hover:text-brand">
              {k}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2.5 space-y-2">
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
            <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="btn btn-ghost h-12 w-10 px-0" aria-label={`Remove ${it.name}`}>
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={() => onChange([...items, { id: `item-${Date.now()}`, name: '', price: '3000000' }])}
        className="link mt-3 inline-flex items-center gap-1 text-sm"
      >
        <Plus className="h-4 w-4" aria-hidden="true" /> Add item
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
        className="w-full bg-transparent text-right outline-none"
        aria-label={label}
      />
    </div>
  );
}

const STEP_NAMES = ['Your shop', 'Game & offer', 'You’re live'];
const STEP_HINTS = ['name and menu', 'we suggest one, you see the cost', 'a QR sign for your counter'];

function Shell({ step, children, aside, back }: { step: 1 | 2 | 3; children: ReactNode; aside?: ReactNode; back?: ReactNode }) {
  return (
    <div className={`mx-auto pb-6 ${aside ? 'max-w-5xl' : 'max-w-[480px]'}`}>
      {back ? <div className="mb-3">{back}</div> : null}
      <div className={`mb-6 ${aside ? 'max-w-[480px] lg:max-w-none' : ''}`}>
        <div className="flex items-center gap-2" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step} aria-label={`Step ${step} of 3: ${STEP_NAMES[step - 1]}`}>
          {[1, 2, 3].map((s) => (
            <div key={s} className="step-dot" data-on={s <= step} />
          ))}
        </div>
        <div className="mt-2 flex justify-between text-xs font-bold" aria-hidden="true">
          {STEP_NAMES.map((n, i) => (
            <span key={n} className={i + 1 === step ? 'text-ink' : 'text-subtle'}>{n}</span>
          ))}
        </div>
      </div>
      <div className={aside ? 'grid items-start gap-10 lg:grid-cols-[480px_1fr]' : ''}>
        <div className="animate-fade-up">{children}</div>
        {aside ? (
          <aside className="sticky top-24 hidden lg:block" aria-label="Preview of your promo page">
            <p className="mb-3 text-sm font-bold text-muted">What customers see</p>
            {aside}
          </aside>
        ) : null}
      </div>
    </div>
  );
}

/** Collapsible preview for phones (the desktop shows it beside the form). */
function MobilePreview({ children }: { children: ReactNode }) {
  return (
    <details className="group mt-5 lg:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl bg-paper px-4 py-3 text-sm font-bold">
        Preview what customers see
        <span className="text-muted transition-transform group-open:rotate-180" aria-hidden="true">⌄</span>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

/** A live, simplified copy of the customer promo page: updates as the owner types and picks. */
function CustomerPreview({ shopName, items, game, offer, chance }: { shopName: string; items: ShopItem[]; game?: Game | null; offer?: string; chance?: number | null }) {
  return (
    <div className="rounded-[28px] bg-night-deep p-2.5" aria-hidden="true">
      <div className="space-y-3 rounded-[20px] bg-paper px-4 pb-5 pt-5">
        <div className="text-center">
          <div className="font-display text-[1.75rem] font-extrabold uppercase leading-none">{shopName.trim() || 'Your shop'}</div>
          <div className="mt-1 text-xs font-bold text-brand">Game-day promo</div>
        </div>
        {game && offer ? (
          <GameCard game={game} offer={offer} audience="customer" chance={chance ?? null} details={false} />
        ) : (
          <div className="rounded-2xl border border-dashed border-line-strong px-4 py-5 text-center text-sm text-muted">Next: pick the game your offer rides on.</div>
        )}
        <ul className="divide-y divide-line rounded-2xl bg-card px-4">
          {(items.length ? items : [{ id: 'x', name: 'Your first item', price: '0' }]).slice(0, 5).map((it) => (
            <li key={it.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="truncate font-bold">{it.name || 'Item'}</span>
              <span className="text-muted">{formatUsd(it.price)}</span>
            </li>
          ))}
        </ul>
        <div className="btn btn-primary btn-block pointer-events-none">Pay</div>
      </div>
    </div>
  );
}

const usd = (n: number) => String(Math.round(n * 1_000_000));
const MENU_PRESETS: Record<string, Omit<ShopItem, 'id'>[]> = {
  Café: [
    { name: 'Drip coffee', price: usd(3) },
    { name: 'Oat latte', price: usd(4.5) },
    { name: 'Cold brew', price: usd(4.25) },
    { name: 'Blueberry muffin', price: usd(3.25) },
  ],
  Bar: [
    { name: 'Draft beer', price: usd(7) },
    { name: 'House wine', price: usd(9) },
    { name: 'Cocktail', price: usd(12) },
    { name: 'Wings', price: usd(13) },
  ],
  Pizza: [
    { name: 'Slice', price: usd(4.5) },
    { name: 'Whole pie', price: usd(18) },
    { name: 'Garlic knots', price: usd(6) },
    { name: 'Soda', price: usd(2.5) },
  ],
  Bakery: [
    { name: 'Croissant', price: usd(3.75) },
    { name: 'Cinnamon roll', price: usd(4.25) },
    { name: 'Sourdough loaf', price: usd(8) },
    { name: 'Coffee', price: usd(3) },
  ],
};

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
