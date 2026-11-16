import { Mark } from '@/components/Brand';

const MOMENTS = [
  'Free if the Spurs win',
  'Order #4QVZU · ready for pickup',
  'Refund protected on Gemini',
  'Recorded on Solana',
  'Spurs win · $4.50 back',
  'Lose · you keep every sale',
];

/** A stadium ribbon board: the game-night moments, set like an LED strip (still, so nothing moves on its own). */
export function Ribbon() {
  return (
    <div className="ribbon on-night bleed" aria-label="Game night, at a glance">
      <div className="ribbon-track">
        <ul className="ribbon-row">
          {MOMENTS.map((m) => (
            <li key={m} className="flex items-center gap-6">
              <span>{m}</span>
              <Mark size={18} tone="mono" className="text-floodlight" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
