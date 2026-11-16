'use client';

import { usePathname } from 'next/navigation';

/**
 * Opening animation on the landing page: the roof draws itself, the ball drops in underneath with a bounce, the
 * wordmark rises, then the curtain lifts. Pure CSS (see .intro in globals.css), about 2 seconds, once per visit
 * (html[data-intro-seen]), and never shown with reduced motion.
 */
export function Intro() {
  const path = usePathname() ?? '/';
  if (path !== '/') return null;
  return (
    <div className="intro on-night" aria-hidden="true">
      <div className="flex flex-col items-center gap-5">
        <svg width="132" height="132" viewBox="0 0 64 64" className="overflow-visible">
          <path className="intro-roof" d="M8.5 35 32 11.5 55.5 35" fill="none" stroke="var(--color-chalk)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
          <circle className="intro-ball" cx="32" cy="44" r="12.5" fill="var(--color-floodlight)" />
        </svg>
        <div className="intro-word font-display text-[2.75rem] font-extrabold uppercase leading-none tracking-[0.02em] text-chalk">
          On <span className="font-semibold opacity-70">the</span> House
        </div>
      </div>
    </div>
  );
}
