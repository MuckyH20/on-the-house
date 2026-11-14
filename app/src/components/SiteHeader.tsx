'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Logo({ className = '' }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2 ${className}`}>
      <img src="/icon.svg" alt="" className="h-7 w-7" />
      <span className="font-display text-xl font-extrabold uppercase leading-none tracking-wide">On the House</span>
    </Link>
  );
}

/** Our brand header — night on the landing page (it sits on the floodlit hero), light in the app. Hidden on customer promo pages, which belong to the shop. */
export function SiteHeader() {
  const path = usePathname() ?? '/';
  if (path.startsWith('/p/')) return null;
  const onStart = path.startsWith('/start');
  const night = path === '/';
  return (
    <header
      className={`sticky top-0 z-30 border-b backdrop-blur-md print:hidden ${
        night ? 'on-night border-white/10 bg-night/90 text-chalk' : 'border-line/80 bg-paper/85'
      }`}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-5 sm:px-8">
        <Logo />
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <Link href="/help" className={`btn btn-sm ${night ? 'btn-ghost-night' : 'btn-ghost'}`}>Help</Link>
          <Link href="/dashboard" className={`btn btn-sm ${night ? 'btn-ghost-night' : 'btn-ghost'}`}>My promos</Link>
          {!onStart ? (
            <Link href="/start" className={`btn btn-sm hidden sm:inline-flex ${night ? 'btn-flood' : 'btn-primary'}`}>
              Start a promo
            </Link>
          ) : null}
        </div>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  const path = usePathname() ?? '/';
  if (path.startsWith('/p/')) return null;
  return (
    <footer className="night on-night mt-16 print:hidden">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 sm:grid-cols-[1.5fr_1fr_1fr] sm:px-8">
        <div>
          <Logo />
          <p className="t-small mt-3 max-w-xs text-chalk-muted">“Free if your team wins” promos at a small, fixed cost. Every refund protected and paid automatically.</p>
        </div>
        <nav aria-label="Product" className="t-small space-y-2">
          <div className="board-label">Product</div>
          <Link href="/start" className="block text-chalk-muted hover:text-chalk">Start a promo</Link>
          <Link href="/dashboard" className="block text-chalk-muted hover:text-chalk">My promos</Link>
          <Link href="/me" className="block text-chalk-muted hover:text-chalk">My rewards</Link>
        </nav>
        <nav aria-label="Learn" className="t-small space-y-2">
          <div className="board-label">Learn</div>
          <Link href="/help" className="block text-chalk-muted hover:text-chalk">How it works & FAQ</Link>
          <a href="https://explorer.solana.com/address/4qfLMXZTmKt71eDH4S3VNSDCRFPX7qxpPk3WZZgt2PM2?cluster=devnet" target="_blank" rel="noreferrer" className="block text-chalk-muted hover:text-chalk">On-chain program ↗</a>
        </nav>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-5 py-5 text-xs text-chalk-muted sm:flex-row sm:justify-between sm:px-8">
          <span>Demo on test networks: Solana devnet and Gemini’s sandbox. No real money.</span>
          <span>Built for UBC 2026</span>
        </div>
      </div>
    </footer>
  );
}
