'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { audioAllowed, playIntro, unlockAudio } from '@/lib/sound';

const ENTERED = 'oth-entered';
const markEntered = () => {
  try {
    localStorage.setItem(ENTERED, '1');
  } catch {
    /* storage blocked: they'll just see the splash again */
  }
};

/**
 * Splash screen on the landing page, first visit only: the roof draws itself, the ball drops in underneath, the
 * wordmark rises, the curtain lifts, and the scoreboard numbers tick up, all with sound.
 *
 * Browsers only allow sound after a tap, so: if this browser already allows it, the splash plays by itself; if not,
 * it waits on "Tap anywhere to start". Either way the device is then marked as entered and later visits go straight
 * in. Clicking the logo on the landing page replays the same thing with sound (the 'oth:intro' event).
 * /?kickoff forces the splash. Never shown with reduced motion.
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
    setTimeout(playIntro, 30); // give the audio context a beat to resume
  };

  useEffect(() => {
    const replay = () => start();
    window.addEventListener('oth:intro', replay);
    // First visit: if sound is already allowed here, don't make them tap.
    const d = document.documentElement;
    if (path === '/' && d.hasAttribute('data-kickoff') && !d.hasAttribute('data-kickoff-run') && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      void audioAllowed().then((ok) => {
        if (ok && !d.hasAttribute('data-kickoff-run')) window.dispatchEvent(new Event('oth:intro'));
      });
    }
    return () => window.removeEventListener('oth:intro', replay);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Arrived home from the logo on another page: play the whole splash with sound once the page is up
  // (the scoreboard listens for the same event, so its count restarts after the curtain instead of running early).
  useEffect(() => {
    const w = window as unknown as { __othReplay?: boolean };
    if (path !== '/' || !w.__othReplay) return;
    w.__othReplay = false;
    const t = setTimeout(() => window.dispatchEvent(new Event('oth:intro')), 60);
    return () => clearTimeout(t);
  }, [path]);

  if (path !== '/') return null;
  const waiting = !run;
  const go = () => window.dispatchEvent(new Event('oth:intro')); // the scoreboard counters listen for this too
  return (
    <div
      key={take}
      className="intro on-night"
      data-run={run || undefined}
      // Waiting for the tap: the whole screen is the button.
      role={waiting ? 'button' : undefined}
      tabIndex={waiting ? 0 : undefined}
      aria-label={waiting ? 'Tap to start' : undefined}
      aria-hidden={run ? true : undefined}
      onClick={waiting ? go : undefined}
      onKeyDown={
        waiting
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                go();
              }
            }
          : undefined
      }
    >
      <div className="flex flex-col items-center gap-5">
        <svg width="132" height="132" viewBox="0 0 64 64" className="overflow-visible">
          {/* While waiting: a faint, breathing outline of the mark where it will draw itself. */}
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
      {/* Shown only while waiting for the tap (html[data-kickoff]). */}
      <p className="intro-kickoff board-label">Tap anywhere to start</p>
    </div>
  );
}
