'use client';

/**
 * Game-day sounds, synthesized with Web Audio (no audio files, nothing to license or download).
 * Browsers only allow sound after the visitor has clicked or tapped, so the context is unlocked on the first
 * pointer/key press (see SoundUnlock) and every sound here follows a user action. Muting is remembered per device.
 */
const KEY = 'oth-sound';
const listeners = new Set<() => void>();
let ctx: AudioContext | null = null;
let master: GainNode | null = null;

export function isMuted(): boolean {
  try {
    return localStorage.getItem(KEY) === 'off';
  } catch {
    return false;
  }
}

export function setMuted(muted: boolean): void {
  try {
    localStorage.setItem(KEY, muted ? 'off' : 'on');
  } catch {
    /* private mode: just this page */
  }
  listeners.forEach((l) => l());
}

export function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Create/resume the audio context. Call from a user gesture (SoundUnlock does this on the first press). */
export function unlockAudio(): void {
  if (typeof window === 'undefined') return;
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.22; // quiet: a cue, not a soundtrack
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    /* no audio available */
  }
}

function ready(): { c: AudioContext; out: GainNode } | null {
  if (isMuted() || !ctx || !master || ctx.state !== 'running') return null;
  return { c: ctx, out: master };
}

/** A tone with an attack/decay envelope. */
function tone(c: AudioContext, out: AudioNode, opts: { type: OscillatorType; freq: number; at: number; dur: number; gain: number; attack?: number; glideTo?: number }) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = opts.type;
  o.frequency.setValueAtTime(opts.freq, opts.at);
  if (opts.glideTo) o.frequency.exponentialRampToValueAtTime(opts.glideTo, opts.at + opts.dur);
  g.gain.setValueAtTime(0.0001, opts.at);
  g.gain.exponentialRampToValueAtTime(opts.gain, opts.at + (opts.attack ?? 0.008));
  g.gain.exponentialRampToValueAtTime(0.0001, opts.at + opts.dur);
  o.connect(g).connect(out);
  o.start(opts.at);
  o.stop(opts.at + opts.dur + 0.05);
  return o;
}

/** A burst of filtered noise (crowd, the "ka" of a register). */
function noise(c: AudioContext, out: AudioNode, opts: { at: number; dur: number; gain: number; type: BiquadFilterType; freq: number; q?: number; attack?: number }) {
  const len = Math.ceil(c.sampleRate * (opts.dur + 0.1));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = opts.type;
  f.frequency.value = opts.freq;
  f.Q.value = opts.q ?? 0.7;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, opts.at);
  g.gain.exponentialRampToValueAtTime(opts.gain, opts.at + (opts.attack ?? 0.01));
  g.gain.exponentialRampToValueAtTime(0.0001, opts.at + opts.dur);
  src.connect(f).connect(g).connect(out);
  src.start(opts.at);
  src.stop(opts.at + opts.dur + 0.1);
}

/** Referee whistle with a crowd swell — a promo goes live. */
export function playWhistle(): void {
  const r = ready();
  if (!r) return;
  const { c, out } = r;
  const t = c.currentTime + 0.02;
  for (const [start, dur] of [[0, 0.11], [0.16, 0.42]] as const) {
    const o = tone(c, out, { type: 'triangle', freq: 2900, at: t + start, dur, gain: 0.5, attack: 0.012 });
    const lfo = c.createOscillator();
    const depth = c.createGain();
    lfo.frequency.value = 42; // the pea's trill
    depth.gain.value = 140;
    lfo.connect(depth).connect(o.frequency);
    lfo.start(t + start);
    lfo.stop(t + start + dur + 0.05);
  }
  noise(c, out, { at: t + 0.2, dur: 1.5, gain: 0.32, type: 'bandpass', freq: 900, q: 0.5, attack: 0.35 });
}

/** Cash register: a mechanical "ka" then a bright "ching" — an order is paid. */
export function playKaching(): void {
  const r = ready();
  if (!r) return;
  const { c, out } = r;
  const t = c.currentTime + 0.02;
  noise(c, out, { at: t, dur: 0.06, gain: 0.5, type: 'highpass', freq: 2500 });
  tone(c, out, { type: 'sine', freq: 2093, at: t + 0.07, dur: 0.7, gain: 0.45 });
  tone(c, out, { type: 'sine', freq: 3136, at: t + 0.07, dur: 0.55, gain: 0.25 });
  tone(c, out, { type: 'sine', freq: 4186, at: t + 0.09, dur: 0.35, gain: 0.12 });
}

/** Counter bell — an order is ready for pickup. */
export function playDing(): void {
  const r = ready();
  if (!r) return;
  const { c, out } = r;
  const t = c.currentTime + 0.02;
  tone(c, out, { type: 'sine', freq: 1319, at: t, dur: 1.3, gain: 0.5, attack: 0.004 });
  tone(c, out, { type: 'sine', freq: 2637, at: t, dur: 0.6, gain: 0.18, attack: 0.004 });
  tone(c, out, { type: 'sine', freq: 3956, at: t, dur: 0.3, gain: 0.08, attack: 0.004 });
}

/** Stadium horn — the team won and refunds are paid. */
export function playHorn(): void {
  const r = ready();
  if (!r) return;
  const { c, out } = r;
  const t = c.currentTime + 0.02;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1400;
  lp.connect(out);
  for (const f of [220, 277.2, 329.6]) tone(c, lp, { type: 'sawtooth', freq: f * 0.97, glideTo: f, at: t, dur: 0.95, gain: 0.16, attack: 0.05 });
  noise(c, out, { at: t + 0.25, dur: 1.4, gain: 0.25, type: 'bandpass', freq: 900, q: 0.5, attack: 0.3 });
}
