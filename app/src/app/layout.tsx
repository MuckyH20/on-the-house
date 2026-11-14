import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { SiteFooter, SiteHeader } from '@/components/SiteHeader';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: 'On the House — free if your team wins',
  description: 'Run “free if your team wins” promos at a small, fixed cost. Zero risk to your shop.',
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#fafaf9' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="flex min-h-dvh flex-col">
        <SiteHeader />
        <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-6 sm:px-8 sm:py-10">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
