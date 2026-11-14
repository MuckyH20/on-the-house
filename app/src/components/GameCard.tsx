'use client';

import { useEffect, useState } from 'react';
import type { Game } from '@/lib/game';

/** Team monogram in the team's color (we draw monograms, not official logos). */
export function TeamMark({ game, size = 44 }: { game: Pick<Game, 'mark' | 'color' | 'team'>; size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white shadow-[inset_0_-2px_0_rgb(0_0_0/0.15)]"
      style={{ width: size, height: size, background: game.color, fontSize: size * (game.mark.length > 1 ? 0.36 : 0.48) }}
      aria-hidden="true"
    >
      {game.mark}
    </div>
  );
}

/** "Final in 42:13" — ticks every second; "Final" once it's over. */
export function Countdown({ closesAt, className = '' }: { closesAt: string | null; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!closesAt) return null;
  const ms = Date.parse(closesAt) - now;
  if (ms <= 0) return <span className={className}>Final</span>;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return <span className={`tabular ${className}`}>Final in {h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`}</span>;
}

/**
 * Kalshi-style outcome card: the matchup, a live countdown, the market's chance, and what happens if they win / lose.
 * `chance` is the market's YES price (0–1) when known.
 */
export function GameCard({
  game,
  offer,
  compact = false,
  audience = 'owner',
  chance = null,
  live = true,
  details = true,
}: {
  game: Game;
  offer: string;
  compact?: boolean;
  audience?: 'owner' | 'customer';
  chance?: number | null;
  live?: boolean;
  /** Show the "wins if …" line (hide in tight spaces). */
  details?: boolean;
}) {
  const pct = chance !== null && chance !== undefined ? Math.round(chance * 100) : null;
  return (
    <div className="card overflow-hidden">
      <div className={`flex items-center gap-3 ${compact ? 'px-3 py-2.5' : 'px-4 py-4'}`}>
        <TeamMark game={game} size={compact ? 36 : 48} />
        <div className="min-w-0 flex-1">
          <div className={`line-clamp-2 font-semibold leading-snug tracking-tight ${compact ? 'text-[0.9375rem]' : 'text-lg'}`}>{game.matchup}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
            {live && game.closesAt && Date.parse(game.closesAt) > Date.now() ? (
              <Countdown closesAt={game.closesAt} className="font-medium text-ink" />
            ) : game.finalAt ? (
              <span>Final {game.finalAt}</span>
            ) : null}
          </div>
        </div>
        {pct !== null && !compact ? (
          <div className="text-right">
            <div className="tabular text-xl font-bold leading-none tracking-tight">{pct}%</div>
            <div className="mt-1 text-[11px] text-subtle">chance</div>
          </div>
        ) : null}
      </div>
      {!compact && details && game.winCondition && game.winCondition !== game.matchup ? (
        <div className="-mt-1 px-4 pb-3 text-xs text-muted">Wins if {lowerFirst(game.winCondition)}{game.finalAt ? ` at ${game.finalAt}` : ''}</div>
      ) : null}
      {pct !== null && !compact ? (
        <div className="mx-4 mb-3 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: game.color }} />
        </div>
      ) : null}
      {!compact ? (
        <div className="grid grid-cols-2 gap-px border-t border-line bg-line text-sm">
          <div className="bg-good-soft px-4 py-3">
            <div className="t-label text-good">If {game.team} wins</div>
            <div className="mt-1 font-semibold text-ink">{offer}</div>
          </div>
          <div className="bg-card px-4 py-3">
            <div className="t-label text-subtle">If {game.team} loses</div>
            <div className="mt-1 font-semibold text-ink">{audience === 'owner' ? 'You keep every sale' : 'Enjoy your order'}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function lowerFirst(t: string): string {
  return /^[A-Z][a-z]/.test(t) && !/^(Bitcoin|Ethereum|Solana|XRP|Gold|Silver)\b/.test(t) ? t[0]!.toLowerCase() + t.slice(1) : t;
}
