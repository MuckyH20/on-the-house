import type { Metadata, Viewport } from 'next';
import { Big_Shoulders, Schibsted_Grotesk } from 'next/font/google';
import { SiteFooter, SiteHeader } from '@/components/SiteHeader';
import './globals.css';

// Display: stadium-signage condensed type for headlines, scores and order numbers. Body: a sturdy newsroom grotesk.
const shoulders = Big_Shoulders({ subsets: ['latin'], variable: '--font-shoulders', display: 'swap', axes: ['opsz'] });
const schibsted = Schibsted_Grotesk({ subsets: ['latin'], variable: '--font-body', display: 'swap' });

export const metadata: Metadata = {
  title: 'On the House — free if your team wins',
  description: 'Run “free if your team wins” promos at a small, fixed cost. Zero risk to your shop.',
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0c1510' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${shoulders.variable} ${schibsted.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <SiteHeader />
        <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-6 sm:px-8 sm:py-10">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
