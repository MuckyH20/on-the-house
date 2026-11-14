'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { CampaignState, ShopProfile } from '@oth/shared/api';
import { TeamMark } from '@/components/GameCard';
import { Qr } from '@/components/Qr';
import { Button, PageSkeleton } from '@/components/ui';
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
  if (!state || !game || !origin) return <PageSkeleton cards={1} />;
  const pct = state.campaign.refundBps / 100;
  return (
    <div className="mx-auto flex min-h-[88vh] max-w-xl flex-col items-center justify-center py-6 text-center">
      <div className="panel-warm w-full px-6 py-10 sm:px-12 sm:py-14 print:bg-none print:shadow-none">
        <div className="t-label text-brand-strong">{shopName} · Game-day promo</div>
        <h1 className="mt-4 text-[2.5rem] font-extrabold leading-[1.04] tracking-[-0.04em] sm:text-6xl">
          {pct >= 100 ? 'Your order is free' : `${pct}% back`}
          <br />
          <span className="text-brand">if {game.team} wins</span>
        </h1>
        <div className="mt-6 inline-flex items-center gap-3 rounded-2xl bg-card px-4 py-2.5 text-left shadow-[var(--shadow-card)]">
          <TeamMark game={game} size={32} />
          <div>
            <div className="font-semibold leading-tight">{game.matchup}</div>
            {game.finalAt ? <div className="text-sm text-muted">Final {game.finalAt}</div> : null}
          </div>
        </div>
        <div className="mt-8 flex justify-center">
          <Qr value={`${origin}/p/${campaign}`} size={240} className="shadow-[var(--shadow-raised)]" />
        </div>
        <div className="t-h2 mt-6">Scan to order</div>
        <p className="mx-auto mt-2 max-w-sm text-muted">If {game.team} wins, your money comes back automatically. No app, nothing to sign up for.</p>
      </div>
      <Button onClick={() => window.print()} variant="dark" size="lg" className="mt-6 print:hidden">Print this sign</Button>
    </div>
  );
}
