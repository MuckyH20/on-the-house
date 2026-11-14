import Link from 'next/link';
import type { ReactNode } from 'react';

/* Shared UI built on the tokens in app/globals.css. Pages compose these — no one-off styling. */

type Variant = 'primary' | 'secondary' | 'dark' | 'success' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

function btnClass(variant: Variant = 'primary', size: Size = 'md', block = false, extra = '') {
  return ['btn', `btn-${variant}`, size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : '', block ? 'btn-block' : '', extra].filter(Boolean).join(' ');
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg className={`h-4 w-4 animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  block = false,
  loading = false,
  className = '',
  disabled,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; block?: boolean; loading?: boolean }) {
  return (
    <button {...rest} disabled={disabled || loading} aria-busy={loading || undefined} className={btnClass(variant, size, block, className)}>
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  children,
  variant = 'primary',
  size = 'md',
  block = false,
  className = '',
  ...rest
}: { href: string; children: ReactNode; variant?: Variant; size?: Size; block?: boolean; className?: string } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  return (
    <Link href={href} {...rest} className={btnClass(variant, size, block, className)}>
      {children}
    </Link>
  );
}

export function Card({ children, className = '', hover = false }: { children: ReactNode; className?: string; hover?: boolean }) {
  return <div className={`card p-4 sm:p-5 ${hover ? 'card-hover' : ''} ${className}`}>{children}</div>;
}

export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`t-label text-brand ${className}`}>{children}</div>;
}

export function Field({ label, help, children }: { label: string; help?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      {children}
      {help ? <span className="field-help block">{help}</span> : null}
    </label>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <div className="t-small text-muted">{label}</div>
      <div className="tabular mt-0.5 text-2xl font-bold tracking-tight">{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-subtle">{sub}</div> : null}
    </div>
  );
}

export function CoverageBar({ bps }: { bps: number }) {
  const pct = Math.min(100, bps / 100);
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Refunds protected">
      <div className={`h-full rounded-full transition-all duration-500 ${pct >= 100 ? 'bg-good' : 'bg-brand'}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

type Tone = 'live' | 'win' | 'lose' | 'caution' | 'info' | 'neutral';
export function Badge({ tone, children, className = '' }: { tone: Tone; children: ReactNode; className?: string }) {
  return <span className={`badge badge-${tone} ${className}`}>{children}</span>;
}

/** Back-compat alias used by older call sites. */
export function Pill({ tone, children }: { tone: 'good' | 'warn' | 'muted' | 'brand'; children: ReactNode }) {
  const map = { good: 'win', warn: 'caution', muted: 'lose', brand: 'neutral' } as const;
  return <Badge tone={map[tone]}>{children}</Badge>;
}

export function Simulated({ show = true, label = 'SIMULATED' }: { show?: boolean; label?: string }) {
  if (!show) return null;
  return (
    <Badge tone="caution">
      <span title="Simulated (demo): not a real Gemini order or result">{label}</span>
    </Badge>
  );
}

export function Notice({ tone = 'info', children, className = '' }: { tone?: 'caution' | 'error' | 'good' | 'info'; children: ReactNode; className?: string }) {
  return <div className={`notice notice-${tone} ${className}`}>{children}</div>;
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

/** A page-sized skeleton: header line + a few cards. */
export function PageSkeleton({ cards = 2 }: { cards?: number }) {
  return (
    <div className="mx-auto max-w-md space-y-4 py-2" role="status" aria-label="Loading">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
      {Array.from({ length: cards }, (_, i) => (
        <Skeleton key={i} className="h-36 w-full rounded-2xl" />
      ))}
    </div>
  );
}

export function EmptyState({ icon = '☕', title, body, action }: { icon?: string; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong bg-card/60 px-6 py-10 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-2xl" aria-hidden="true">{icon}</div>
      <div className="t-h3 mt-3">{title}</div>
      {body ? <p className="t-small mx-auto mt-1 max-w-xs text-muted">{body}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** Check mark that draws itself + a small confetti burst (disabled for reduced motion). */
export function SuccessBurst() {
  const colors = ['#f97316', '#c2410c', '#047857', '#fbbf24', '#0369a1'];
  const bits = Array.from({ length: 18 }, (_, i) => {
    const angle = (i / 18) * Math.PI * 2;
    const dist = 70 + (i % 3) * 22;
    return { dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist - 20, rot: (i * 47) % 360, color: colors[i % colors.length]!, delay: (i % 4) * 40 };
  });
  return (
    <div className="relative mx-auto h-20 w-20" aria-hidden="true">
      {bits.map((b, i) => (
        <span
          key={i}
          className="confetti-bit"
          style={{ background: b.color, animationDelay: `${b.delay}ms`, ['--dx' as string]: `${b.dx}px`, ['--dy' as string]: `${b.dy}px`, ['--rot' as string]: `${b.rot}deg` }}
        />
      ))}
      <div className="animate-pop flex h-20 w-20 items-center justify-center rounded-full bg-good text-white shadow-[var(--shadow-raised)]">
        <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none">
          <path className="check-draw" d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

export function CampaignStatus({ status, outcome, pausedByHedger }: { status: string; outcome: string; pausedByHedger?: boolean }) {
  if (status === 'settled') return <Badge tone={outcome === 'yes' ? 'win' : 'lose'}>{outcome === 'yes' ? 'Won · refunds paid' : 'Didn’t win'}</Badge>;
  if (status === 'cancelled') return <Badge tone="lose">Cancelled</Badge>;
  if (status === 'paused') return <Badge tone="caution">{pausedByHedger ? 'Paused · prices moved' : 'Paused'}</Badge>;
  return <Badge tone="live">Live</Badge>;
}
