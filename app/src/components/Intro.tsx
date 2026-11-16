'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Volume2 } from 'lucide-react';
import { playIntro, unlockAudio } from '@/lib/sound';

const ENTERED = 'oth-entered';
const markEntered = () => {
  try {
    localStorage.setItem(ENTERED, '1');
  } catch {
    /* storage blocked: they'll just see the entrance again */
  }
};

/**
 * Opening animation on the landing page: the roof draws itself, the ball drops in underneath with a bounce, the
 * wordmark rises, then the curtain lifts. Pure CSS (see .intro in globals.css), about 2 seconds.
 *
 * Sound needs a tap (browsers block audio before one), so:
 *  - First ever visit on this device (or /?kickoff): an entrance screen waits for "Kick off" (with sound) or
 *    "Enter quietly". Either tap marks the device as entered; later visits skip straight to the site.
 *  - Clicking the logo on the landing page replays the intro with sound (the 'oth:intro' event).
 * Never shown with reduced motion.
 */
export function Intro() {
  const path = usePathname() ?? '/';
  const [run, setRun] = useState(false);
  const [take, setTake] = useState(0);

  const start = () => {
    markEntered();
    unlockAudio();
    document.documentElement.setAttribute('data-kickoff-run', '');
    setRun(true);
    setTake((n) => n + 1); // fresh DOM, so the CSS animations start from the top
    // give the context a beat to resume before scheduling the sounds
    setTimeout(playIntro, 30);
  };

  useEffect(() => {
    const replay = () => start();
    window.addEventListener('oth:intro', replay);
    return () => window.removeEventListener('oth:intro', replay);
  }, []);

  if (path !== '/') return null;
  return (
    <div key={take} className="intro on-night" data-run={run || undefined} aria-hidden={run ? true : undefined}>
      <div className="flex flex-col items-center gap-5">
        <svg width="132" height="132" viewBox="0 0 64 64" className="overflow-visible">
          {/* Entrance only: a faint, breathing outline of the mark where it will draw itself. */}
          <g className="intro-ghost">
            <path d="M8.5 35 32 11.5 55.5 35" fill="none" stroke="var(--color-chalk)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="32" cy="44" r="12.5" fill="var(--color-floodlight)" />
          </g>
          <path className="intro-roof" d="M8.5 35 32 11.5 55.5 35" fill="none" stroke="var(--color-chalk)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
          <circle className="intro-ball" cx="32" cy="44" r="12.5" fill="var(--color-floodlight)" />
        </svg>
        <div className="intro-word font-display text-[2.75rem] font-extrabold uppercase leading-none tracking-[0.02em] text-chalk">
          On <span className="font-semibold opacity-70">the</span> House
        </div>
      </div>
      {/* Kick-off mode only (html[data-kickoff]): wait for a tap so the intro can play with sound. */}
      <div className="intro-kickoff">
        <button type="button" onClick={() => window.dispatchEvent(new Event('oth:intro'))} className="btn btn-flood btn-lg min-w-48">
          <Volume2 className="h-5 w-5" aria-hidden="true" /> Kick off
        </button>
        <p className="text-sm text-chalk-muted">Best with sound on</p>
        <button
          type="button"
          onClick={() => {
            markEntered();
            document.documentElement.setAttribute('data-intro-seen', '');
            document.documentElement.setAttribute('data-kickoff-run', '');
            window.dispatchEvent(new Event('oth:count'));
          }}
          className="btn btn-ghost-night btn-sm"
        >
          Enter quietly
        </button>
      </div>
    </div>
  );
}
