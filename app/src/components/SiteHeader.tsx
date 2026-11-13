'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Our brand header — hidden on customer promo pages, which belong to the shop. */
export function SiteHeader() {
  const path = usePathname() ?? '/';
  if (path.startsWith('/p/')) return null;
  return (
    <header className="border-b border-line bg-card">
      <nav className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3 text-sm">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <img src="/icon.svg" alt="" className="h-6 w-6" /> On the House
        </Link>
        <div className="ml-auto flex items-center gap-4">
          <Link href="/help" className="text-muted hover:text-ink">Help</Link>
          <Link href="/dashboard" className="text-muted hover:text-ink">My promos</Link>
        </div>
      </nav>
    </header>
  );
}
