'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { Keypair, PublicKey } from '@solana/web3.js';
import { formatUsd, parseUsd } from '@oth/shared';
import type { CampaignState, Quote } from '@oth/shared/api';
import { Button, Card, Simulated } from '@/components/ui';
import { connection, engine, friendlyTxError, getJson, signAndSend, useBurner, usePoll } from '@/lib/client';

const MENU = [
  { id: 'espresso', name: 'Espresso', price: '2.00', emoji: '☕' },
  { id: 'latte', name: 'Oat latte', price: '4.50', emoji: '🥛' },
  { id: 'coldbrew', name: 'Cold brew', price: '3.75', emoji: '🧊' },
  { id: 'bagel', name: 'Everything bagel', price: '3.00', emoji: '🥯' },
  { id: 'cookie', name: 'Choc chip cookie', price: '1.00', emoji: '🍪' },
] as const;

type PayResponse = { transaction: string; amount: string; refund?: string; premium: string };

export default function ShopPage() {
  const { campaign } = useParams<{ campaign: string }>();
  const burner = useBurner();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [balance, setBalance] = useState<bigint | null>(null);
  const [busy, setBusy] = useState<'pay' | 'faucet' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ amount: string; refund: string; signature: string } | null>(null);
  const [showQr, setShowQr] = useState(false);

  const total = MENU.reduce((s, m) => s + parseUsd(m.price) * BigInt(cart[m.id] ?? 0), 0n);
  const items = MENU.filter((m) => cart[m.id]).map((m) => `${cart[m.id]}× ${m.name}`).join(', ');

  const state = usePoll(() => engine<CampaignState>(`/campaigns/${campaign}/state`), 5_000, [campaign]);
  const quote = usePoll(() => engine<Quote>(`/quote/${campaign}?amount=${total > 0n ? total : 1_000_000n}`), 4_000, [campaign, total]);
  const c = state.data?.campaign;
  const condition = state.data?.market?.condition ?? c?.marketSymbol ?? '…';
  const refundPct = c ? c.refundBps / 100 : 0;
  const sim = state.data?.simulated;

  async function refreshBalance(kp: Keypair | null = burner) {
    if (!kp || !state.data) return;
    const mint = new PublicKey((await engine<{ usdcMint: string }>('/health')).usdcMint);
    const bal = await connection().getTokenAccountBalance(getAssociatedTokenAddressSync(mint, kp.publicKey), 'confirmed').catch(() => null);
    setBalance(BigInt(bal?.value.amount ?? '0'));
  }
  useEffect(() => {
    void refreshBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [burner, !!state.data]);

  async function faucet() {
    if (!burner) return;
    setBusy('faucet');
    setError(null);
    try {
      await getJson('/api/faucet', { method: 'POST', body: JSON.stringify({ wallet: burner.publicKey.toBase58() }) });
      await refreshBalance();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function tapToPay() {
    if (!burner || total === 0n) return;
    setBusy('pay');
    setError(null);
    try {
      const res = await getJson<PayResponse>(`/api/pay/${campaign}?amount=${formatUsd(total).slice(1)}&item=${encodeURIComponent(items)}`, {
        method: 'POST',
        body: JSON.stringify({ account: burner.publicKey.toBase58() }),
      });
      let signature: string;
      try {
        signature = await signAndSend(res.transaction, burner);
      } catch (e) {
        throw new Error(friendlyTxError((e as Error).message));
      }
      setReceipt({ amount: res.amount, refund: res.refund ?? '0', signature });
      setCart({});
      void engine(`/campaigns/${campaign}/kick`, { method: 'POST', body: '{}' }).catch(() => {});
      void refreshBalance();
      void state.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const ended = c && (c.status === 'settled' || c.status === 'cancelled');
  const available = quote.data?.available ?? false;

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="flex items-center gap-3">
        <img src="/icon.svg" alt="" className="h-10 w-10" />
        <div>
          <h1 className="text-xl font-bold">UBC Coffee Cart</h1>
          <div className="text-xs text-muted">Demo store · prices in demo dollars</div>
        </div>
      </div>

      {/* promo banner */}
      <div className={`rounded-xl p-4 ${ended ? 'bg-line' : 'bg-brand text-white'}`}>
        {c ? (
          ended ? (
            <div className="text-sm">This promo is over. {c.outcome === 'yes' ? 'It happened — refunds were paid automatically!' : 'It didn’t happen this time.'}</div>
          ) : (
            <>
              <div className="text-xs font-semibold uppercase tracking-wider opacity-80">Today’s promo</div>
              <div className="mt-1 text-lg font-bold leading-snug">
                {refundPct >= 100 ? 'Your order is free' : `Get ${refundPct}% back`} if {condition}.
              </div>
              <div className="mt-1 text-xs opacity-80">Pay as usual. If it happens, the money goes back to you automatically.</div>
              {sim?.gemini || sim?.resolution ? <div className="mt-2"><Simulated /></div> : null}
            </>
          )
        ) : state.error ? <div className="text-sm">Can’t load this promo ({state.error}).</div> : <div className="text-sm">Loading…</div>}
      </div>
      {!ended && quote.data && !available ? <div className="rounded-lg bg-warn-soft p-3 text-sm text-warn">{quote.data.reason}</div> : null}

      {/* menu */}
      <Card className="divide-y divide-line p-0">
        {MENU.map((m) => (
          <div key={m.id} className="flex items-center gap-3 px-4 py-3">
            <span className="text-2xl">{m.emoji}</span>
            <div className="flex-1">
              <div className="font-medium">{m.name}</div>
              <div className="tabular text-sm text-muted">${m.price}</div>
            </div>
            <div className="flex items-center gap-2">
              {cart[m.id] ? (
                <>
                  <button aria-label={`Remove ${m.name}`} onClick={() => setCart((c) => ({ ...c, [m.id]: Math.max(0, (c[m.id] ?? 0) - 1) }))} className="h-8 w-8 rounded-full border border-line">−</button>
                  <span className="tabular w-4 text-center">{cart[m.id]}</span>
                </>
              ) : null}
              <button aria-label={`Add ${m.name}`} onClick={() => setCart((c) => ({ ...c, [m.id]: (c[m.id] ?? 0) + 1 }))} className="h-8 w-8 rounded-full bg-ink text-white">+</button>
            </div>
          </div>
        ))}
      </Card>

      {/* checkout */}
      <Card className="space-y-3">
        <div className="flex items-baseline justify-between">
          <span className="text-muted">Total</span>
          <span className="tabular text-2xl font-bold">{formatUsd(total)}</span>
        </div>
        {total > 0n && quote.data?.refund && !ended ? (
          <div className="rounded-lg bg-good-soft p-2 text-sm text-good">If {condition}, you get <b>{formatUsd(quote.data.refund)}</b> back.</div>
        ) : null}
        <Button onClick={tapToPay} disabled={!burner || total === 0n || busy !== null || !available || !!ended || (balance !== null && balance < total)} className="w-full py-3 text-base">
          {busy === 'pay' ? 'Paying…' : `Tap to pay ${total > 0n ? formatUsd(total) : ''}`}
        </Button>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">Wallet balance: <span className="tabular">{balance === null ? '…' : formatUsd(balance)}</span></span>
          <button onClick={faucet} disabled={busy !== null} className="text-brand underline disabled:opacity-40">{busy === 'faucet' ? 'Adding…' : 'Add $20 demo dollars'}</button>
        </div>
        {balance !== null && total > 0n && balance < total ? <div className="text-sm text-warn">Not enough demo dollars — tap “Add $20” first.</div> : null}
        {error ? <div className="text-sm text-warn">{error}</div> : null}
        <button onClick={() => setShowQr((v) => !v)} className="w-full text-center text-sm text-muted underline" disabled={total === 0n}>
          {showQr ? 'Hide QR code' : 'Or pay with a phone wallet (QR)'}
        </button>
        {showQr && total > 0n ? <SolanaPayQr campaign={campaign} amount={total} items={items} onPaid={(sig, refund) => { setReceipt({ amount: total.toString(), refund, signature: sig }); setCart({}); setShowQr(false); }} refund={quote.data?.refund ?? '0'} /> : null}
      </Card>

      {receipt ? (
        <Card className="space-y-1 border-good">
          <div className="text-lg font-bold">Thanks! Paid {formatUsd(receipt.amount)} ✅</div>
          <div className="text-sm">If {condition}, you get <b>{formatUsd(receipt.refund)}</b> back — automatically.</div>
          <div className="flex gap-3 pt-1 text-sm">
            <Link href="/me" className="text-brand underline">See my refunds</Link>
            <a className="text-muted underline" target="_blank" rel="noreferrer" href={`https://explorer.solana.com/tx/${receipt.signature}?cluster=devnet`}>Receipt on Solana</a>
          </div>
        </Card>
      ) : null}

      <div className="text-center text-xs text-muted">
        <Link href={`/proof/${campaign}`} className="underline">How refunds are guaranteed</Link>
      </div>
    </div>
  );
}

/** Solana Pay QR (transaction request) for Phantom etc. on devnet. Detects payment via a `reference` key. */
function SolanaPayQr({ campaign, amount, items, refund, onPaid }: { campaign: string; amount: bigint; items: string; refund: string; onPaid: (sig: string, refund: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [reference] = useState(() => Keypair.generate().publicKey);
  const [link, setLink] = useState('');
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { createQR, encodeURL } = await import('@solana/pay');
      const api = new URL(`/api/pay/${campaign}`, window.location.origin);
      api.searchParams.set('amount', formatUsd(amount).slice(1));
      api.searchParams.set('item', items.slice(0, 40));
      api.searchParams.set('reference', reference.toBase58());
      const url = encodeURL({ link: api, label: 'UBC Coffee Cart', message: `${formatUsd(amount)} · promo refund ${formatUsd(refund)}` });
      if (cancelled || !ref.current) return;
      setLink(url.toString());
      ref.current.innerHTML = '';
      createQR(url, 240, 'white', 'black').append(ref.current);
    })();
    return () => {
      cancelled = true;
    };
  }, [campaign, amount, items, reference, refund]);

  // Poll for a transaction mentioning the reference key.
  useEffect(() => {
    const t = setInterval(async () => {
      const sigs = await connection().getSignaturesForAddress(reference, { limit: 1 }, 'confirmed').catch(() => []);
      const s = sigs[0];
      if (s && !s.err) {
        clearInterval(t);
        onPaid(s.signature, refund);
      }
    }, 2500);
    return () => clearInterval(t);
  }, [reference, refund, onPaid]);

  const local = typeof window !== 'undefined' && /localhost|127\.0\.0\.1/.test(window.location.hostname);
  return (
    <div className="flex flex-col items-center gap-2 py-2">
      <div ref={ref} className="rounded-lg bg-white p-2" />
      <div className="text-center text-xs text-muted">Scan with Phantom (set to <b>devnet</b>). You need demo dollars in that wallet first.</div>
      {local ? <div className="text-center text-xs text-warn">This page is on localhost, so a phone can’t reach it. Use the HTTPS deployment or a tunnel.</div> : null}
      {link ? <code className="max-w-full break-all text-[10px] text-muted">{link}</code> : null}
    </div>
  );
}
