import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'On the House',
  description: 'Promos like "free if Bitcoin is above $X at 3 PM" — at a fixed cost the shop knows upfront.',
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#fafaf9' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <header className="border-b border-line bg-card">
          <nav className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3 text-sm">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <img src="/icon.svg" alt="" className="h-6 w-6" /> On the House
            </Link>
            <div className="ml-auto flex gap-4 text-muted">
              <Link href="/merchant" className="hover:text-ink">For shops</Link>
              <Link href="/me" className="hover:text-ink">My refunds</Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
