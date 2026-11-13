'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { CampaignState, ShopProfile } from '@oth/shared/api';
import { Qr } from '@/components/Qr';
import { engine } from '@/lib/client';
import { gameFor } from '@/lib/game';
import { DEMO_SHOP } from '@/lib/shop';

/** A counter sign: the offer in big type plus a QR code to the promo page. Print it or show it on a tablet. */
export default function PrintPage() {
  const { campaign } = useParams<{ campaign: string }>();
  const [state, setState] = useState<CampaignState | null>(null);
  const [shopName, setShopName] = useState<string | null>(null);
  const [origin, setOrigin] = useState('');
  useEffect(() => {
    setOrigin(window.location.origin);
    void engine<CampaignState>(`/campaigns/${campaign}/state`).then(async (s) => {
      setState(s);
      const shop = await engine<ShopProfile>(`/shops/${s.campaign.merchant}`).catch(() => null);
      setShopName(shop?.name ?? DEMO_SHOP.name);
    });
  }, [campaign]);
  const game = gameFor(state?.market ?? null);
  if (!state || !game || !origin) return <div className="py-20 text-center text-muted">Preparing your sign…</div>;
  const pct = state.campaign.refundBps / 100;
  return (
    <div className="mx-auto flex min-h-[90vh] max-w-xl flex-col items-center justify-center gap-6 py-6 text-center">
      <div className="text-sm font-semibold uppercase tracking-[0.2em] text-muted">{shopName}</div>
      <h1 className="text-5xl font-extrabold leading-tight tracking-tight">
        {pct >= 100 ? 'Your order is FREE' : `${pct}% back`}
        <br />
        <span className="text-brand">if {game.team} wins</span>
      </h1>
      <div className="text-xl">
        {game.emoji} {game.matchup}
        {game.finalAt ? <span className="text-muted"> · final {game.finalAt}</span> : null}
      </div>
      <Qr value={`${origin}/p/${campaign}`} size={260} className="border border-line" />
      <div className="text-lg font-semibold">Scan to order</div>
      <p className="max-w-sm text-sm text-muted">If {game.team} wins, your money comes back automatically. Nothing to sign up for.</p>
      <button onClick={() => window.print()} className="rounded-xl bg-ink px-6 py-3 font-semibold text-white print:hidden">Print this sign</button>
    </div>
  );
}
