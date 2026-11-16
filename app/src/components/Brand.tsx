'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The On the House mark: a game ball sheltered under a roof. "On the house" means free, and the house has the
 * customer covered if their team wins. Two shapes, readable at 16px, works in one color.
 */
export function Mark({ size = 32, tone = 'auto', className = '' }: { size?: number; tone?: 'auto' | 'night' | 'mono'; className?: string }) {
  // auto: roof follows the text color (ink on light, chalk on night); night: a self-contained app-icon tile.
  const roof = tone === 'night' ? 'var(--color-chalk)' : 'currentColor';
  const ball = tone === 'mono' ? 'currentColor' : 'var(--color-floodlight)';
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
      {tone === 'night' ? <rect width="64" height="64" rx="15" fill="var(--color-night)" /> : null}
      <path d="M8.5 35 32 11.5 55.5 35" fill="none" stroke={roof} strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="32" cy="44" r="12.5" fill={ball} />
    </svg>
  );
}

/** Mark + wordmark. The wordmark is set in the display face; "the" is lighter so the name reads ON · HOUSE. */
export function Logo({ className = '', size = 30 }: { className?: string; size?: number }) {
  const path = usePathname();
  return (
    <Link
      href="/"
      className={`group flex items-center gap-2.5 transition-transform duration-300 ease-[var(--ease-out)] hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${className}`}
      aria-label="On the House, home"
      onClick={(e) => {
        // Replay the opening animation with sound (this click is the tap browsers require). From another page,
        // let the link go home and ask the landing page to play it on arrival.
        if (path !== '/') {
          (window as unknown as { __othReplay?: boolean }).__othReplay = true;
          return;
        }
        e.preventDefault();
        window.scrollTo({ top: 0 });
        window.dispatchEvent(new Event('oth:intro'));
      }}
    >
      <Mark size={size} />
      <span className="whitespace-nowrap font-display text-[1.375rem] font-extrabold uppercase leading-none tracking-[0.02em]">
        On <span className="font-semibold opacity-70">the</span> House
      </span>
    </Link>
  );
}
