'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Logo({ className = '' }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2 font-bold tracking-tight ${className}`}>
      <img src="/icon.svg" alt="" className="h-7 w-7" />
      <span>On the House</span>
    </Link>
  );
}

/** Our brand header — hidden on customer promo pages, which belong to the shop. */
export function SiteHeader() {
  const path = usePathname() ?? '/';
  if (path.startsWith('/p/')) return null;
  const onStart = path.startsWith('/start');
  return (
    <header className="sticky top-0 z-30 border-b border-line/80 bg-paper/80 backdrop-blur-md print:hidden">
      <nav className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-5 sm:px-8">
        <Logo />
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <Link href="/help" className="btn btn-ghost btn-sm">Help</Link>
          <Link href="/dashboard" className="btn btn-ghost btn-sm">My promos</Link>
          {!onStart ? <Link href="/start" className="btn btn-primary btn-sm hidden sm:inline-flex">Start a promo</Link> : null}
        </div>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  const path = usePathname() ?? '/';
  if (path.startsWith('/p/')) return null;
  return (
    <footer className="mt-16 border-t border-line bg-card print:hidden">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 sm:grid-cols-[1.5fr_1fr_1fr] sm:px-8">
        <div>
          <Logo />
          <p className="t-small mt-3 max-w-xs text-muted">“Free if your team wins” promos at a small, fixed cost — every refund protected and paid automatically.</p>
        </div>
        <div className="t-small space-y-2">
          <div className="t-label text-subtle">Product</div>
          <Link href="/start" className="block text-muted hover:text-ink">Start a promo</Link>
          <Link href="/dashboard" className="block text-muted hover:text-ink">My promos</Link>
          <Link href="/me" className="block text-muted hover:text-ink">My rewards</Link>
        </div>
        <div className="t-small space-y-2">
          <div className="t-label text-subtle">Learn</div>
          <Link href="/help" className="block text-muted hover:text-ink">How it works & FAQ</Link>
          <a href="https://explorer.solana.com/address/4qfLMXZTmKt71eDH4S3VNSDCRFPX7qxpPk3WZZgt2PM2?cluster=devnet" target="_blank" rel="noreferrer" className="block text-muted hover:text-ink">On-chain program ↗</a>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-5 py-5 text-xs text-subtle sm:flex-row sm:justify-between sm:px-8">
          <span>Demo on test networks — Solana devnet and Gemini’s sandbox. No real money.</span>
          <span>Built for UBC 2026</span>
        </div>
      </div>
    </footer>
  );
}
