import type { Game } from '@/lib/game';

/** Kalshi-style outcome display: the matchup, and what happens if they win or lose. */
export function GameCard({ game, offer, compact = false, audience = 'owner' }: { game: Game; offer: string; compact?: boolean; audience?: 'owner' | 'customer' }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-card">
      <div className={`flex items-center gap-3 ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}>
        <span className={compact ? 'text-xl' : 'text-3xl'}>{game.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className={`truncate font-semibold ${compact ? 'text-sm' : 'text-base'}`}>{game.matchup}</div>
          <div className="text-xs text-muted">
            {game.finalAt ? `Final at ${game.finalAt}` : ''}
            {!compact && game.winCondition && game.winCondition !== game.matchup ? ` · wins if ${lowerFirst(game.winCondition)}` : ''}
          </div>
        </div>
      </div>
      {!compact ? (
        <div className="grid grid-cols-2 border-t border-line text-sm">
          <div className="border-r border-line bg-good-soft/60 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-good">If {game.team} wins</div>
            <div className="mt-0.5 font-medium">{offer}</div>
          </div>
          <div className="px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">If {game.team} loses</div>
            <div className="mt-0.5 font-medium">{audience === 'owner' ? 'You keep every sale' : 'Enjoy your order'}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function lowerFirst(t: string): string {
  return /^[A-Z][a-z]/.test(t) && !/^(Bitcoin|Ethereum|Solana|XRP|Gold|Silver)\b/.test(t) ? t[0]!.toLowerCase() + t.slice(1) : t;
}
