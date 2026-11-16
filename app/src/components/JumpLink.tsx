'use client';

import type { ReactNode } from 'react';

/**
 * An in-page link that scrolls to its section on every click. A plain "#how" link only works the first time:
 * once the URL already ends in #how, clicking again changes nothing, so the page never moves.
 */
export function JumpLink({ to, className = '', children }: { to: string; className?: string; children: ReactNode }) {
  return (
    <a
      href={`#${to}`}
      className={className}
      onClick={(e) => {
        const target = document.getElementById(to);
        if (!target) return;
        e.preventDefault();
        const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        target.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
        history.replaceState(null, '', `#${to}`);
      }}
    >
      {children}
    </a>
  );
}
