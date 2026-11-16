'use client';

import { useEffect, useState } from 'react';
import { TeamMark } from '@/components/GameCard';
import type { Game } from '@/lib/game';
import { costBps } from '@/lib/shop';

const LATTE = 4.5;
const ASK = 0.25;

/** Example game for the landing page. */
const SPURS: Game = {
  team: 'the Spurs',
  emoji: '🏀',
  mark: 'SA',
  color: '#5f6b73',
  logo: '/logos/spurs.svg',
  closesAt: null,
  versus: '',
  finalAt: '8 PM',
  matchup: 'Will the San Antonio Spurs win?',
  winCondition: 'the San Antonio Spurs win',
  condition: 'the San Antonio Spurs win tonight',
};

/**
 * Scoreboard numbers roll up from zero as the board lands (after the opening animation on a first visit).
 * Server-rendered at their final values, so nothing is wrong without JS; static for reduced motion.
 */
function useCountUp(target: number, decimals: number): string {
  const [value, setValue] = useState(target);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const delay = (document.documentElement.hasAttribute('data-intro-seen') ? 0 : 1550) + 700;
    setValue(0);
    const start = performance.now() + delay;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - start) / 1100));
      setValue(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return value.toFixed(decimals);
}

/** The landing hero's scoreboard: one game night, and what a "free if they win" latte costs the shop. */
export function HeroScoreboard({ className = '' }: { className?: string }) {
  const cost = (LATTE * costBps(100, String(ASK))) / 10_000;
  const pct = useCountUp(Math.round(ASK * 100), 0);
  const costShown = useCountUp(Number(cost.toFixed(2)), 2);
  const back = useCountUp(LATTE, 2);
  return (
    <div className={`board w-full p-5 sm:p-7 ${className}`}>
      <span className="board-label">Example game night</span>

      <div className="mt-4 flex items-center gap-4">
        <TeamMark game={SPURS} size={56} />
        <div className="font-display text-[2.125rem] font-extrabold uppercase leading-[0.92] sm:text-[2.5rem]">{SPURS.matchup}</div>
      </div>

      <dl className="board-rule mt-5 grid grid-cols-2 border-y">
        <div className="board-rule border-r py-3.5 pr-4">
          <dt className="board-label">Final</dt>
          <dd className="mt-1.5">
            <span className="digits text-[2.5rem]">{SPURS.finalAt}</span>
            <span className="mt-1 block text-sm text-chalk-muted">tonight</span>
          </dd>
        </div>
        <div className="py-3.5 pl-4">
          <dt className="board-label">Chance they win</dt>
          <dd className="mt-1.5">
            <span className="digits text-[2.5rem]">{pct}%</span>
            <span className="mt-1 block text-sm text-chalk-muted">market odds</span>
          </dd>
        </div>
      </dl>

      <dl className="mt-5 grid grid-cols-2 gap-4">
        <div>
          <dt className="board-label">Free latte costs you</dt>
          <dd className="mt-1.5">
            <span className="t-score text-[2.5rem] text-chalk">${costShown}</span>
            <span className="mt-1 block text-sm text-chalk-muted">on a ${LATTE.toFixed(2)} latte, win or lose</span>
          </dd>
        </div>
        <div>
          <dt className="board-label">If the Spurs win</dt>
          <dd className="mt-1.5">
            <span className="t-score text-[2.5rem] text-chalk">${back}</span>
            <span className="mt-1 block text-sm text-chalk-muted">back to the customer, paid by us</span>
          </dd>
        </div>
      </dl>
    </div>
  );
}
