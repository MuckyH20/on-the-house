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
      <div className="ticket w-full print:border-0 print:shadow-none">
        <div className="px-6 pb-8 pt-10 sm:px-12 sm:pt-12">
          <h1 className="font-display text-[3.25rem] font-extrabold uppercase leading-[0.9] sm:text-[4.5rem]">
            {pct >= 100 ? 'Your order is free' : `${pct}% back`}
            <span className="mt-1 block text-brand">if {game.team} wins</span>
          </h1>
          <div className="on-night mx-auto mt-7 flex max-w-sm items-center gap-3 rounded-2xl bg-night-deep px-4 py-3 text-left text-chalk print:bg-white print:text-ink print:ring-2 print:ring-ink">
            <TeamMark game={game} size={40} />
            <div className="min-w-0">
              <div className="font-display text-2xl font-extrabold uppercase leading-none">{game.matchup}</div>
              {game.finalAt ? <div className="board-label mt-1 print:text-muted">Final {game.finalAt}</div> : null}
            </div>
          </div>
          <div className="mt-8 flex justify-center">
            <Qr value={`${origin}/p/${campaign}`} size={240} className="ring-1 ring-line" />
          </div>
          <p className="t-h2 mt-6">Scan to order</p>
          <p className="mx-auto mt-2 max-w-sm text-muted">If {game.team} wins, your money comes back automatically. No app, nothing to sign up for.</p>
        </div>
        <div className="ticket-tear px-6 py-4">
          <p className="font-display text-2xl font-extrabold uppercase">{shopName}</p>
          <p className="text-sm text-subtle">Game-day promo</p>
        </div>
      </div>
      <Button onClick={() => window.print()} variant="dark" size="lg" className="mt-6 print:hidden">Print this sign</Button>
    </div>
  );
}
