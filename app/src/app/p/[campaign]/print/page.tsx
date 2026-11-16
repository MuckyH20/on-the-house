'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CircleDollarSign, Printer, ScanLine, Trophy } from 'lucide-react';
import type { CampaignState, ShopProfile } from '@oth/shared/api';
import { Mark } from '@/components/Brand';
import { Qr } from '@/components/Qr';
import { Button, PageSkeleton } from '@/components/ui';
import { engine } from '@/lib/client';
import { gameFor, type Game } from '@/lib/game';
import { DEMO_SHOP } from '@/lib/shop';

/**
 * The counter sign: a full Letter-size poster (offer, game, big QR, shop). Every size inside is relative to the
 * sheet (cqw), so the on-screen preview and the printout match. Print styles (globals.css, .poster) drop the
 * browser's own header/footer by printing with zero page margins.
 */
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
  const offer = pct >= 100 ? 'Your order is free' : `${pct}% back on your order`;

  return (
    <div className="poster-wrap flex flex-col items-center gap-5 py-2">
      <div className="poster">
        {/* Floodlit band: the offer */}
        <header className="poster-band night on-night">
          <h1 className="poster-offer">
            {offer}
            <span className="block text-floodlight">if {game.team} wins</span>
          </h1>
        </header>

        <div className="poster-body">
          {/* The game, as a scoreboard strip */}
          <div className="poster-board on-night">
            <PosterTeamMark game={game} />
            <div className="min-w-0 text-left">
              <div className="poster-matchup">{game.matchup}</div>
              {game.finalAt ? <div className="poster-final">Final {game.finalAt}</div> : null}
            </div>
          </div>

          {/* The QR, framed by corner brackets */}
          <div className="poster-qr">
            <span className="poster-corner poster-corner-tl" aria-hidden="true" />
            <span className="poster-corner poster-corner-tr" aria-hidden="true" />
            <span className="poster-corner poster-corner-bl" aria-hidden="true" />
            <span className="poster-corner poster-corner-br" aria-hidden="true" />
            <Qr value={`${origin}/p/${campaign}`} size="100%" className="!rounded-none !p-0" />
          </div>

          <p className="poster-scan">Scan to order</p>

          {/* Three steps a customer reads in two seconds */}
          <ol className="poster-steps">
            {[
              { Icon: ScanLine, title: 'Scan', body: 'Point your phone camera at the code' },
              { Icon: CircleDollarSign, title: 'Order & pay', body: 'Normal price, right on your phone' },
              { Icon: Trophy, title: `${game.team} win${game.team.startsWith('the ') ? '' : 's'}?`, body: 'Your money comes back automatically' },
            ].map(({ Icon, title, body }, i) => (
              <li key={i} className="poster-step">
                <span className="poster-step-n">{i + 1}</span>
                <Icon className="poster-step-icon" aria-hidden="true" />
                <span className="poster-step-title">{title}</span>
                <span className="poster-step-body">{body}</span>
              </li>
            ))}
          </ol>
        </div>

        <footer className="poster-foot">
          <div className="min-w-0">
            <div className="poster-shop" data-long={(shopName?.length ?? 0) > 16 || undefined}>{shopName}</div>
            <div className="poster-small">Game-day promo</div>
          </div>
          <div className="poster-brand">
            <Mark size={28} className="text-ink" />
            <span>
              On <span className="font-semibold opacity-60">the</span> House
            </span>
          </div>
        </footer>
      </div>

      <div className="flex flex-col items-center gap-2 print:hidden">
        <Button onClick={() => window.print()} variant="dark" size="lg">
          <Printer className="h-5 w-5" aria-hidden="true" /> Print this sign
        </Button>
        <p className="max-w-sm text-center text-sm text-muted">Letter size. If the colors don’t print, turn on “Background graphics” in the print dialog.</p>
      </div>
    </div>
  );
}

/** Team logo or monogram, sized relative to the sheet. */
function PosterTeamMark({ game }: { game: Game }) {
  return game.logo ? (
    <div className="poster-mark bg-white">
      <img src={game.logo} alt="" className="h-[78%] w-[78%] object-contain" />
    </div>
  ) : (
    <div className="poster-mark font-display font-extrabold text-white" style={{ background: game.color }} aria-hidden="true">
      {game.mark}
    </div>
  );
}
