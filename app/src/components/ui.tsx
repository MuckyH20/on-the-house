import type { ReactNode } from 'react';

export function Simulated({ show = true, label = 'SIMULATED' }: { show?: boolean; label?: string }) {
  if (!show) return null;
  return (
    <span title="Uses a simulated market (mock mode), not real Gemini trading" className="inline-flex items-center rounded border border-amber-400 bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-amber-800">
      {label}
    </span>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-line bg-card p-4 shadow-sm ${className}`}>{children}</div>;
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="tabular text-2xl font-semibold">{value}</div>
      {sub ? <div className="text-xs text-muted">{sub}</div> : null}
    </div>
  );
}

export function CoverageBar({ bps }: { bps: number }) {
  const pct = Math.min(100, bps / 100);
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-good' : 'bg-brand'}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Pill({ tone, children }: { tone: 'good' | 'warn' | 'muted' | 'brand'; children: ReactNode }) {
  const cls = {
    good: 'bg-good-soft text-good',
    warn: 'bg-warn-soft text-warn',
    muted: 'bg-line text-muted',
    brand: 'bg-brand-soft text-brand',
  }[tone];
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

export function Button({ children, className = '', ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}

export function CampaignStatus({ status, outcome, pausedByHedger }: { status: string; outcome: string; pausedByHedger?: boolean }) {
  if (status === 'settled') return <Pill tone={outcome === 'yes' ? 'good' : 'muted'}>{outcome === 'yes' ? 'Happened · refunds paid' : 'Didn’t happen'}</Pill>;
  if (status === 'cancelled') return <Pill tone="muted">Cancelled</Pill>;
  if (status === 'paused') return <Pill tone="warn">{pausedByHedger ? 'Paused (price too high)' : 'Paused'}</Pill>;
  return <Pill tone="brand">Live</Pill>;
}
