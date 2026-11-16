'use client';

import { useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { Mark } from '@/components/Brand';

const MOMENTS = [
  'Free if the Spurs win',
  'Order #4QVZU · ready for pickup',
  'Refund protected on Gemini',
  'Recorded on Solana',
  'Spurs win · $4.50 back',
  'Lose · you keep every sale',
];

/**
 * A stadium ribbon board: game-night moments scrolling slowly past, like the LED ticker around an arena.
 * Pauses on hover, on keyboard focus and with its own button; still for reduced motion.
 */
export function Ribbon() {
  const [paused, setPaused] = useState(false);
  const row = (copy: boolean) => (
    <ul className="ribbon-row" aria-hidden={copy || undefined}>
      {MOMENTS.map((m) => (
        <li key={m} className="flex items-center gap-6">
          <span>{m}</span>
          <Mark size={18} tone="mono" className="text-floodlight" />
        </li>
      ))}
    </ul>
  );
  return (
    <div className="ribbon on-night bleed" data-paused={paused || undefined} role="region" aria-label="Game night, at a glance">
      <div className="ribbon-track">
        {row(false)}
        {row(true)}
      </div>
      <button type="button" className="ribbon-toggle" onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Play the ticker' : 'Pause the ticker'} aria-pressed={paused}>
        {paused ? <Play className="h-3.5 w-3.5" aria-hidden="true" /> : <Pause className="h-3.5 w-3.5" aria-hidden="true" />}
      </button>
    </div>
  );
}
