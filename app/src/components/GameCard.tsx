'use client';

import { useEffect, useRef, useState } from 'react';
import type { Game } from '@/lib/game';

/** Team mark: the team's logo when one is given (on a white disc), else a monogram in the team's color. */
export function TeamMark({ game, size = 44 }: { game: Pick<Game, 'mark' | 'color' | 'team' | 'logo'>; size?: number }) {
  const [broken, setBroken] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  // An image can fail before hydration attaches onError; catch that case too.
  useEffect(() => {
    if (img.current?.complete && img.current.naturalWidth === 0) setBroken(true);
  }, [game.logo]);
  if (game.logo && !broken) {
    return (
      <div className="flex shrink-0 items-center justify-center rounded-full bg-white shadow-[inset_0_-2px_0_rgb(0_0_0/0.08)]" style={{ width: size, height: size }}>
        <img ref={img} src={game.logo} alt="" className="h-[78%] w-[78%] object-contain" onError={() => setBroken(true)} />
      </div>
    );
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-display font-extrabold text-white shadow-[inset_0_-2px_0_rgb(0_0_0/0.18)]"
      style={{ width: size, height: size, background: game.color, fontSize: size * (game.mark.length > 1 ? 0.42 : 0.56) }}
      aria-hidden="true"
    >
      {game.mark}
    </div>
  );
}

/** Time left until `closesAt` ("42:13", "1:05:09"), ticking every second; null once it's over. */
export function useTimeLeft(closesAt: string | null): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!closesAt) return null;
  const ms = Date.parse(closesAt) - now;
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  // Over a day away, a ticking clock is noise: show days and hours instead.
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** "Final in 42:13" as text; "Final" once it's over. */
export function Countdown({ closesAt, className = '' }: { closesAt: string | null; className?: string }) {
  const left = useTimeLeft(closesAt);
  if (!closesAt) return null;
  return <span className={`tabular ${className}`}>{left ? `Final in ${left}` : 'Final'}</span>;
}

/**
 * The scoreboard strip: matchup, live clock and the market's chance on a night face, then what happens if they
 * win / lose. `chance` is the market's YES price (0–1) when known.
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
  const left = useTimeLeft(live ? game.closesAt : null);
  return (
    <div className="@container overflow-hidden rounded-[var(--radius-card)] border border-line bg-card shadow-[var(--shadow-card)]">
      <div className={`on-night bg-night-deep text-chalk ${compact ? 'px-3 py-3' : 'px-4 pb-4 pt-4'}`}>
        <div className="flex items-start gap-3">
          <TeamMark game={game} size={compact ? 34 : 42} />
          <div className="min-w-0 flex-1">
            <div className={`line-clamp-2 font-display font-extrabold uppercase leading-[0.95] ${compact ? 'text-xl' : 'text-[1.375rem] @sm:text-[1.75rem]'}`}>{game.matchup}</div>
            <div className="mt-1.5 flex items-baseline gap-2">
              {left ? (
                <>
                  <span className="board-label">Final in</span>
                  <span className="digits text-lg">{left}</span>
                </>
              ) : game.finalAt ? (
                <span className="board-label">Final {game.finalAt}</span>
              ) : null}
            </div>
          </div>
          {pct !== null && !compact ? (
            <div className="text-right">
              <div className="digits text-[1.75rem] @sm:text-[2.25rem]">{pct}%</div>
              <div className="board-label mt-1">chance</div>
            </div>
          ) : null}
        </div>
        {pct !== null && !compact ? (
          <div className="mt-3.5 h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
            <div className="h-full rounded-full bg-floodlight" style={{ width: `${pct}%` }} />
          </div>
        ) : null}
      </div>
      {!compact && details && game.winCondition && game.winCondition !== game.matchup ? (
        <div className="border-b border-line px-4 py-2.5 text-sm text-muted">Wins if {lowerFirst(game.winCondition)}{game.finalAt ? ` at ${game.finalAt}` : ''}.</div>
      ) : null}
      {!compact ? (
        <div className="grid grid-cols-2 divide-x divide-line text-[0.9375rem]">
          <div className="bg-good-soft px-4 py-3">
            <div className="t-label text-good">If {game.team} wins</div>
            <div className="mt-1 font-bold text-ink">{offer}</div>
          </div>
          <div className="px-4 py-3">
            <div className="t-label text-subtle">If {game.team} loses</div>
            <div className="mt-1 font-bold text-ink">{audience === 'owner' ? 'You keep every sale' : 'Enjoy your order'}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function lowerFirst(t: string): string {
  return /^[A-Z][a-z]/.test(t) && !/^(Bitcoin|Ethereum|Solana|XRP|Gold|Silver)\b/.test(t) ? t[0]!.toLowerCase() + t.slice(1) : t;
}
