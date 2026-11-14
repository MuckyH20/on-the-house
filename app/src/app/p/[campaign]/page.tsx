'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { Keypair, PublicKey } from '@solana/web3.js';
import { formatUsd } from '@oth/shared';
import type { CampaignState, Quote, ShopItem, ShopOrder, ShopProfile } from '@oth/shared/api';
import { GameCard } from '@/components/GameCard';
import { Minus, Plus, SearchX } from 'lucide-react';
import { Button, EmptyState, Notice, PageSkeleton, Simulated, Spinner } from '@/components/ui';
import { connection, engine, friendlyTxError, getJson, signAndSend, useBurner, usePoll } from '@/lib/client';
import { customerOffer, gameFor } from '@/lib/game';
import { DEMO_SHOP } from '@/lib/shop';
import { orderNumber } from '@/lib/order';
import { privyEnabled, useOwner } from '@/lib/owner';

type PayResponse = { transaction: string; amount: string; refund?: string; premium: string };

const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
const bytesToB64 = (bytes: Uint8Array) => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

export default function PromoPage() {
  const { campaign } = useParams<{ campaign: string }>();
  const burner = useBurner();
  const account = useOwner();
  // Signed-in customers pay from their own account wallet (rewards follow them); otherwise this device's wallet.
  // The shop's own account can't buy from its own promo (it would pay itself), so owners testing use the device wallet.
  const [merchantOfPromo, setMerchantOfPromo] = useState<string | null>(null);
  const isShopAccount = !!account.address && account.address === merchantOfPromo;
  const usingAccount = account.authenticated && !!account.address && !!account.signTransaction && !isShopAccount;
  const payer = usingAccount ? account.address : (burner?.publicKey.toBase58() ?? null);
  const [shop, setShop] = useState<Pick<ShopProfile, 'name' | 'items'> | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [balance, setBalance] = useState<bigint | null>(null);
  const [busy, setBusy] = useState<'pay' | 'faucet' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ amount: string; refund: string; signature: string; device: boolean } | null>(null);
  const [showWallet, setShowWallet] = useState(false);

  const state = usePoll(() => engine<CampaignState>(`/campaigns/${campaign}/state`), 5_000, [campaign]);
  const c = state.data?.campaign;
  useEffect(() => {
    if (c?.merchant) setMerchantOfPromo(c.merchant);
  }, [c?.merchant]);
  const items: ShopItem[] = shop?.items ?? [];
  const total = items.reduce((s, m) => s + BigInt(m.price) * BigInt(cart[m.id] ?? 0), 0n);
  const summary = items.filter((m) => cart[m.id]).map((m) => `${cart[m.id]}× ${m.name}`).join(', ');
  const quote = usePoll(() => engine<Quote>(`/quote/${campaign}?amount=${total > 0n ? total : 1_000_000n}`), 4_000, [campaign, total]);

  // The shop behind this promo (falls back to the demo coffee cart for promos launched before shop profiles).
  useEffect(() => {
    if (!c?.merchant || shop) return;
    void engine<ShopProfile>(`/shops/${c.merchant}`)
      .then((p) => setShop(p))
      .catch(() => setShop(DEMO_SHOP));
  }, [c?.merchant, shop]);

  const game = gameFor(state.data?.market ?? null);
  const refundPct = c ? c.refundBps / 100 : 0;
  const ended = c && (c.status === 'settled' || c.status === 'cancelled');
  const available = quote.data?.available ?? false;
  const usdcMint = useRef<PublicKey | null>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (receipt) receiptRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [receipt]);

  async function refreshBalance() {
    if (!payer) return;
    usdcMint.current ??= new PublicKey((await engine<{ usdcMint: string }>('/health')).usdcMint);
    const bal = await connection().getTokenAccountBalance(getAssociatedTokenAddressSync(usdcMint.current, new PublicKey(payer)), 'confirmed').catch(() => null);
    setBalance(BigInt(bal?.value.amount ?? '0'));
  }
  useEffect(() => {
    setBalance(null);
    void refreshBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payer]);

  async function addFunds() {
    if (!payer) return;
    setBusy('faucet');
    setError(null);
    try {
      await getJson('/api/faucet', { method: 'POST', body: JSON.stringify({ wallet: payer }) });
      await refreshBalance();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function pay() {
    if (!payer || total === 0n) return;
    const lines = items.filter((m) => cart[m.id]).map((m) => ({ id: m.id, qty: cart[m.id]! }));
    setBusy('pay');
    setError(null);
    try {
      const res = await getJson<PayResponse>(`/api/pay/${campaign}?amount=${formatUsd(total).slice(1).replace(/,/g, '')}&item=${encodeURIComponent(summary)}`, {
        method: 'POST',
        body: JSON.stringify({ account: payer }),
      });
      let signature: string;
      try {
        if (usingAccount && account.signTransaction) {
          const signed = await account.signTransaction(b64ToBytes(res.transaction));
          signature = (await getJson<{ signature: string }>('/api/submit', { method: 'POST', body: JSON.stringify({ transaction: bytesToB64(signed) }) })).signature;
        } else {
          signature = await signAndSend(res.transaction, burner!);
        }
      } catch (e) {
        throw new Error(friendlyTxError((e as Error).message));
      }
      setReceipt({ amount: res.amount, refund: res.refund ?? '0', signature, device: !usingAccount });
      // Send what was ordered to the shop's order screen (checked against the payment on-chain).
      void engine('/orders', { method: 'POST', body: JSON.stringify({ signature, items: lines }) }).catch(() => {});
      setCart({});
      void engine(`/campaigns/${campaign}/kick`, { method: 'POST', body: '{}' }).catch(() => {});
      void refreshBalance();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (state.error && !state.data)
    return (
      <div className="mx-auto max-w-md pt-10">
        <EmptyState icon={SearchX} title="This promo couldn’t be found" body="Check the link or ask the shop for a new one." />
      </div>
    );
  if (!c || !shop) return <PageSkeleton cards={3} />;

  return (
    <div className="mx-auto max-w-md space-y-4 pb-6">
      <header className="pt-2 text-center">
        <h1 className="t-h1">{shop.name}</h1>
        <p className="mt-1.5 text-sm font-bold text-brand">Game-day promo</p>
      </header>

      {ended ? (
        <div className={`notice text-center ${c.outcome === 'yes' ? 'notice-good' : 'bg-paper text-muted'}`}>
          This promo is over. {c.outcome === 'yes' ? `${game?.team ?? 'They'} won — everyone who ordered got their money back! 🎉` : `${game?.team ?? 'They'} didn’t win this time.`}
        </div>
      ) : game ? (
        <>
          <GameCard game={game} offer={customerOffer(refundPct)} audience="customer" chance={state.data?.market?.yesAsk ? Number(state.data.market.yesAsk) : null} />
          <p className="px-2 text-center text-sm text-muted">
            Pay the normal price now. If {game.team} wins, {refundPct >= 100 ? 'all of it' : `${refundPct}% of it`} comes back to you automatically right after the final{game.finalAt ? ` (${game.finalAt})` : ''}.
          </p>
        </>
      ) : null}
      {state.data?.simulated.gemini && !ended ? (
        <div className="text-center"><Simulated label="Practice game · simulated result" /></div>
      ) : null}
      {!ended && quote.data && !available ? <Notice tone="caution">{quote.data.reason}</Notice> : null}

      {/* menu */}
      <div className="card divide-y divide-line overflow-hidden p-0">
        {items.map((m) => (
          <div key={m.id} className="flex items-center gap-3 px-4 py-3.5">
            <div className="min-w-0 flex-1">
              <div className="font-bold">{m.name}</div>
              <div className="text-sm text-muted">{formatUsd(m.price)}</div>
            </div>
            {cart[m.id] ? (
              <>
                <button aria-label={`Remove ${m.name}`} onClick={() => setCart((x) => ({ ...x, [m.id]: Math.max(0, (x[m.id] ?? 0) - 1) }))} className="btn btn-secondary h-10 w-10 rounded-full p-0"><Minus className="h-4 w-4" aria-hidden="true" /></button>
                <span className="tabular w-5 text-center font-semibold">{cart[m.id]}</span>
              </>
            ) : null}
            <button aria-label={`Add ${m.name}`} onClick={() => setCart((x) => ({ ...x, [m.id]: (x[m.id] ?? 0) + 1 }))} className="btn btn-dark h-10 w-10 rounded-full p-0"><Plus className="h-4 w-4" aria-hidden="true" /></button>
          </div>
        ))}
      </div>

      {/* checkout */}
      <div className="card space-y-4 p-5">
        <div className="flex items-baseline justify-between">
          <span className="text-muted">Total</span>
          <span className="t-score text-[2.5rem]">{formatUsd(total)}</span>
        </div>
        {total > 0n && quote.data?.refund && !ended && game ? (
          <Notice tone="good">If {game.team} wins, you get <b>{formatUsd(quote.data.refund)}</b> back — automatically.</Notice>
        ) : null}
        <Button onClick={() => void pay()} loading={busy === 'pay'} disabled={!payer || total === 0n || busy !== null || !available || !!ended || (balance !== null && balance < total)} size="lg" block>
          {busy === 'pay' ? 'Paying…' : `Pay ${total > 0n ? formatUsd(total) : ''}`}
        </Button>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">Your balance: <span className="font-bold text-ink">{balance === null ? '…' : formatUsd(balance)}</span></span>
          <button onClick={() => void addFunds()} disabled={busy !== null} className="link disabled:opacity-40">{busy === 'faucet' ? 'Adding…' : 'Add $20 (demo)'}</button>
        </div>
        {balance !== null && total > 0n && balance < total ? <Notice tone="caution">Not enough balance — tap “Add $20 (demo)” first.</Notice> : null}
        {privyEnabled() && isShopAccount ? (
          <Notice tone="info">You’re signed in as this shop, so this test order is paid from this device.</Notice>
        ) : privyEnabled() ? (
          usingAccount ? (
            <div className="notice notice-good flex items-center justify-between gap-2">
              <span>Rewards save to your account{account.label ? ` (${account.label})` : ''}</span>
              <button onClick={() => void account.logout()} className="underline">Sign out</button>
            </div>
          ) : (
            <Button onClick={account.login} disabled={!account.ready} variant="secondary" block>
              Sign in to save your rewards <span className="font-normal text-subtle">— optional</span>
            </Button>
          )
        ) : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
        <button onClick={() => setShowWallet((v) => !v)} className="link-muted w-full text-center text-xs" disabled={total === 0n}>
          {showWallet ? 'Hide' : 'Pay with a crypto wallet instead'}
        </button>
        {showWallet && total > 0n ? <WalletQr campaign={campaign} amount={total} items={summary} refund={quote.data?.refund ?? '0'} onPaid={(sig) => setReceipt({ amount: total.toString(), refund: quote.data?.refund ?? '0', signature: sig, device: false })} /> : null}
      </div>

      {receipt ? (
        <div ref={receiptRef} className="ticket animate-fade-up ring-2 ring-good/60">
          <div className="flex items-start justify-between gap-3 p-5">
            <div>
              <p className="t-h2">Thanks!</p>
              <p className="mt-1 text-sm text-muted">Paid {formatUsd(receipt.amount)} · show this at the counter</p>
            </div>
            <div className="text-right">
              <div className="t-label text-subtle">Order</div>
              <div className="t-score mt-1 text-[2.75rem] tracking-wide">#{orderNumber(receipt.signature)}</div>
            </div>
          </div>
          <div className="ticket-tear space-y-3 p-5 pt-4">
          {game ? <p className="text-[0.9375rem]">If {game.team} wins, you get <b>{formatUsd(receipt.refund)}</b> back, automatically. No need to do anything.</p> : null}
          <OrderStatusLine signature={receipt.signature} />
          {receipt.device && privyEnabled() ? (
            <div className="rounded-xl bg-paper p-3 text-sm text-muted">
              This reward is saved on this phone. <button onClick={account.login} className="link">Sign in</button> before your next order to keep rewards on any device.
            </div>
          ) : null}
          {!receipt.device ? <div className="text-sm text-good">Saved to your account — see it on any device.</div> : null}
          <Link href="/me" className="link inline-block text-sm">See my rewards →</Link>
          </div>
        </div>
      ) : null}

      <footer className="flex flex-col items-center gap-1 pt-4 text-center text-xs text-subtle">
        <Link href={`/proof/${campaign}`} className="link-muted">How refunds are guaranteed</Link>
        <span>Powered by <b className="font-semibold text-muted">On the House</b></span>
      </footer>
    </div>
  );
}

/** Solana Pay QR (Phantom etc.), tucked away for customers who prefer their own wallet. */
function WalletQr({ campaign, amount, items, refund, onPaid }: { campaign: string; amount: bigint; items: string; refund: string; onPaid: (sig: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [reference] = useState(() => Keypair.generate().publicKey);
  const paidRef = useRef(onPaid);
  paidRef.current = onPaid;
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { createQR, encodeURL } = await import('@solana/pay');
      const api = new URL(`/api/pay/${campaign}`, window.location.origin);
      api.searchParams.set('amount', formatUsd(amount).slice(1).replace(/,/g, ''));
      api.searchParams.set('item', items.slice(0, 40));
      api.searchParams.set('reference', reference.toBase58());
      const url = encodeURL({ link: api, label: 'On the House', message: `${formatUsd(amount)} · promo refund ${formatUsd(refund)}` });
      if (cancelled || !ref.current) return;
      ref.current.innerHTML = '';
      createQR(url, 220, 'white', 'black').append(ref.current);
    })();
    return () => {
      cancelled = true;
    };
  }, [campaign, amount, items, reference, refund]);
  useEffect(() => {
    const t = setInterval(async () => {
      const sigs = await connection().getSignaturesForAddress(reference, { limit: 1 }, 'confirmed').catch(() => []);
      if (sigs[0] && !sigs[0].err) {
        clearInterval(t);
        paidRef.current(sigs[0].signature);
      }
    }, 2500);
    return () => clearInterval(t);
  }, [reference]);
  return (
    <div className="flex flex-col items-center gap-2 py-2">
      <div ref={ref} className="rounded-xl border border-line bg-white p-2" />
      <div className="text-center text-xs text-muted">Scan with a Solana wallet app (test network). Needs demo dollars in that wallet.</div>
    </div>
  );
}

/** Live pickup status for the customer's order (the shop marks it ready / picked up on its order screen). */
function OrderStatusLine({ signature }: { signature: string }) {
  const order = usePoll(() => engine<ShopOrder>(`/orders/${signature}`), 4_000, [signature]);
  const status = order.data?.status ?? 'new';
  const text = { new: 'Preparing your order — show this number at the counter.', ready: 'Ready for pickup ✓', done: 'Picked up — enjoy!' }[status];
  return (
    <div className={`notice flex items-center gap-2 ${status === 'ready' ? 'notice-good font-semibold' : 'bg-paper text-muted'}`} role="status" aria-live="polite">
      {status === 'new' ? <Spinner className="text-brand" /> : null}
      {text}
    </div>
  );
}
