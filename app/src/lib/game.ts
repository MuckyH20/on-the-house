import type { MarketSummary } from '@oth/shared/api';

/**
 * Present a prediction market like a game: a "team", what it's up against, and when it's final.
 *   "BTC price today at 8pm EST — $71,000 or above" → Bitcoin vs. $71,000 · final 8pm ET
 *   "ETH price today at 4:15pm EST — Up"            → Ethereum vs. the clock · final 4:15pm ET
 */
export interface Game {
  team: string;
  emoji: string;
  /** Monogram + team color for the team mark (we draw monograms, not official logos). */
  mark: string;
  color: string;
  /** Optional logo image URL; the monogram is shown if it's missing or fails to load. */
  logo?: string;
  /** ISO time of the final (for countdowns). */
  closesAt: string | null;
  versus: string;
  /** "8pm ET" */
  finalAt: string;
  /** "Bitcoin vs. $71,000" */
  matchup: string;
  /** What "winning" means, short: "Bitcoin finishes at or above $71,000" */
  winCondition: string;
  /** Plain sentence for banners: "Bitcoin is at or above $71,000 at 8pm ET" */
  condition: string;
}

const TEAMS: Record<string, { name: string; emoji: string; mark: string; color: string }> = {
  BTC: { name: 'Bitcoin', emoji: '🟠', mark: '₿', color: '#f7931a' },
  ETH: { name: 'Ethereum', emoji: '🔷', mark: 'Ξ', color: '#4f46e5' },
  SOL: { name: 'Solana', emoji: '🟣', mark: '◎', color: '#7c3aed' },
  XRP: { name: 'XRP', emoji: '⚫', mark: 'X', color: '#334155' },
  GOLD: { name: 'Gold', emoji: '🟡', mark: 'Au', color: '#ca8a04' },
  SILVER: { name: 'Silver', emoji: '⚪', mark: 'Ag', color: '#64748b' },
};

export function gameFor(m: Pick<MarketSummary, 'title' | 'condition' | 'closesAt'> | null | undefined): Game | null {
  if (!m) return null;
  const finalAt = m.closesAt ? formatFinal(m.closesAt) : '';
  const [eventTitle, label = ''] = m.title.split(' — ');
  const price = /^(\S+) price\b/i.exec(eventTitle?.trim() ?? '');
  const sym = price?.[1]?.trim().toUpperCase() ?? '';
  const team = TEAMS[sym] ?? (price ? { name: price[1]!.trim(), emoji: '🏁', mark: price[1]!.trim().slice(0, 2).toUpperCase(), color: '#57534e' } : null);
  if (team) {
    const up = /^up$/i.test(label.trim());
    const threshold = label.replace(/\s*or above$/i, '').trim();
    const versus = up ? 'the clock' : threshold || 'the line';
    const winCondition = up ? `${team.name} finishes up` : `${team.name} finishes at or above ${threshold}`;
    return {
      team: team.name,
      emoji: team.emoji,
      mark: team.mark,
      color: team.color,
      closesAt: m.closesAt ?? null,
      versus,
      finalAt,
      matchup: `${team.name} vs. ${versus}`,
      winCondition,
      condition: `${winCondition}${finalAt ? ` at ${finalAt}` : ''}`,
    };
  }
  return { team: m.title, emoji: '🏁', mark: '★', color: '#57534e', closesAt: m.closesAt ?? null, versus: '', finalAt, matchup: m.title, winCondition: m.condition, condition: m.condition };
}

function formatFinal(iso: string): string {
  const d = new Date(iso);
  const t = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay ? t.replace(':00', '') : `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${t.replace(':00', '')}`;
}

/** Customer-facing offer: "Your order is free" / "You get 50% back". */
export function customerOffer(refundPct: number): string {
  return refundPct >= 100 ? 'Your order is free' : `You get ${refundPct}% back`;
}

/** "in 42 min" / "in 2 h" */
export function startsIn(iso: string | null): string {
  if (!iso) return '';
  const min = Math.round((Date.parse(iso) - Date.now()) / 60_000);
  if (min < 60) return `in ${Math.max(min, 0)} min`;
  return `in ${Math.round(min / 60)} h`;
}
