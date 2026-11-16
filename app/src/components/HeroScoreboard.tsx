'use client';

import { useEffect, useState } from 'react';
import { TeamMark } from '@/components/GameCard';
import type { Game } from '@/lib/game';
import { costBps } from '@/lib/shop';
import { playScoreLock, playTick } from '@/lib/sound';

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
 * Scoreboard numbers roll up from zero as the board lands, ticking like a scoreboard and chiming as they lock in.
 * Server-rendered at their final values, so nothing is wrong without JS; static for reduced motion.
 * Starts after the opening animation; in kick-off mode (/?kickoff) it waits for the tap, and every replay
 * ('oth:intro') re-counts. Sounds only play once audio is unlocked by a tap, like every sound on the site.
 */
function useCountUp(target: number, decimals: number, chime = false): string {
  const [value, setValue] = useState(target);
  const [take, setTake] = useState<{ n: number; intro: boolean }>({ n: 0, intro: false });
  useEffect(() => {
    const replay = () => setTake((t) => ({ n: t.n + 1, intro: true }));
    const skip = () => setTake((t) => ({ n: t.n + 1, intro: false }));
    window.addEventListener('oth:intro', replay);
    window.addEventListener('oth:count', skip);
    return () => {
      window.removeEventListener('oth:intro', replay);
      window.removeEventListener('oth:count', skip);
    };
  }, []);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const d = document.documentElement;
    if (take.n === 0 && d.hasAttribute('data-kickoff') && !d.hasAttribute('data-kickoff-run')) {
      setValue(0); // kick-off mode: hold at zero until the tap
      return;
    }
    const introPlaying = take.n > 0 ? take.intro : !d.hasAttribute('data-intro-seen');
    const delay = (introPlaying ? 1550 : 0) + 700;
    setValue(0);
    const start = performance.now() + delay;
    let raf = 0;
    let shown = (0).toFixed(decimals);
    const tick = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - start) / 1100));
      const v = target * (1 - Math.pow(1 - p, 3));
      setValue(v);
      const next = v.toFixed(decimals);
      if (next !== shown && p < 1) playTick(p);
      shown = next;
      if (p < 1) raf = requestAnimationFrame(tick);
      else if (chime) playScoreLock();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, decimals, chime, take]);
  return value.toFixed(decimals);
}

/** The landing hero's scoreboard: one game night, and what a "free if they win" latte costs the shop. */
export function HeroScoreboard({ className = '' }: { className?: string }) {
  const cost = (LATTE * costBps(100, String(ASK))) / 10_000;
  const pct = useCountUp(Math.round(ASK * 100), 0, true);
  const costShown = useCountUp(Number(cost.toFixed(2)), 2);
  const back = useCountUp(LATTE, 2);
  // What the shop keeps of each promo latte (the same whether the team wins or loses).
  const keepShown = useCountUp(Number((LATTE - Number(cost.toFixed(2))).toFixed(2)), 2);
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
        <div>
          <dt className="board-label">You keep</dt>
          <dd className="mt-1.5">
            <span className="t-score text-[2.5rem] text-chalk">${keepShown}</span>
            <span className="mt-1 block text-sm text-chalk-muted">of each latte, win or lose</span>
          </dd>
        </div>
        <div>
          <dt className="board-label">If the Spurs lose</dt>
          <dd className="mt-1.5">
            <span className="t-score text-[2.5rem] text-chalk-muted">$0.00</span>
            <span className="mt-1 block text-sm text-chalk-muted">no refunds, nobody owes anything</span>
          </dd>
        </div>
      </dl>
    </div>
  );
}
