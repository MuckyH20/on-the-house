'use client';

import { TeamMark } from '@/components/GameCard';
import type { Game } from '@/lib/game';
import { costBps } from '@/lib/shop';

const LATTE = 4.5;
const ASK = 0.25;

/** Example game for the landing page (a monogram, not the team's logo). */
const SPURS: Game = {
  team: 'the Spurs',
  emoji: '🏀',
  mark: 'SA',
  color: '#5f6b73',
  closesAt: null,
  versus: '',
  finalAt: '8 PM',
  matchup: 'Will the San Antonio Spurs win?',
  winCondition: 'the San Antonio Spurs win',
  condition: 'the San Antonio Spurs win tonight',
};

/** The landing hero's scoreboard: one game night, and what a "free if they win" latte costs the shop. */
export function HeroScoreboard() {
  const cost = (LATTE * costBps(100, String(ASK))) / 10_000;
  return (
    <div className="board w-full p-5 sm:p-7">
      <span className="board-label">Example game night</span>

      <div className="mt-4 flex items-center gap-4">
        <TeamMark game={SPURS} size={56} />
        <div className="font-display text-[2.125rem] font-extrabold uppercase leading-[0.92] sm:text-[2.5rem]">{SPURS.matchup}</div>
      </div>

      <dl className="board-rule mt-5 grid grid-cols-2 border-y">
        <div className="board-rule border-r py-3.5 pr-4">
          <dt className="board-label">Final</dt>
          <dd className="digits mt-1.5 text-[2.5rem]">{SPURS.finalAt}</dd>
        </div>
        <div className="py-3.5 pl-4">
          <dt className="board-label">Chance they win</dt>
          <dd className="digits mt-1.5 text-[2.5rem]">{Math.round(ASK * 100)}%</dd>
        </div>
      </dl>

      <dl className="mt-5 grid grid-cols-2 gap-4">
        <div>
          <dt className="board-label">Free latte costs you</dt>
          <dd className="mt-1.5">
            <span className="t-score text-[2.5rem] text-chalk">${cost.toFixed(2)}</span>
            <span className="mt-1 block text-sm text-chalk-muted">on ${LATTE.toFixed(2)}, win or lose</span>
          </dd>
        </div>
        <div>
          <dt className="board-label">If the Spurs win</dt>
          <dd className="mt-1.5">
            <span className="t-score text-[2.5rem] text-chalk">${LATTE.toFixed(2)}</span>
            <span className="mt-1 block text-sm text-chalk-muted">back to the customer, paid by us</span>
          </dd>
        </div>
      </dl>
    </div>
  );
}
