'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { isMuted, setMuted, subscribe, unlockAudio } from '@/lib/sound';

/** Unlocks audio on the first click, tap or key press anywhere (browsers block sound before one). */
export function SoundUnlock() {
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);
  return null;
}

/** Sound on/off. Remembered on this device. */
export function SoundToggle({ className = '', label = false }: { className?: string; label?: boolean }) {
  const muted = useSyncExternalStore(subscribe, isMuted, () => false);
  const Icon = muted ? VolumeX : Volume2;
  return (
    <button
      type="button"
      onClick={() => setMuted(!muted)}
      className={className}
      aria-pressed={!muted}
      aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
      title={muted ? 'Sound off' : 'Sound on'}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label ? <span>{muted ? 'Sound off' : 'Sound on'}</span> : null}
    </button>
  );
}
