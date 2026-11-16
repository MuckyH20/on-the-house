import type { Metadata, Viewport } from 'next';
import { Big_Shoulders, Schibsted_Grotesk } from 'next/font/google';
import Script from 'next/script';
import { Intro } from '@/components/Intro';
import { SoundUnlock } from '@/components/Sound';
import { SiteFooter, SiteHeader } from '@/components/SiteHeader';
import './globals.css';

// Display: stadium-signage condensed type for headlines, scores and order numbers. Body: a sturdy newsroom grotesk.
const shoulders = Big_Shoulders({ subsets: ['latin'], variable: '--font-shoulders', display: 'swap', axes: ['opsz'] });
const schibsted = Schibsted_Grotesk({ subsets: ['latin'], variable: '--font-body', display: 'swap' });

// Absolute base for share-card URLs: an explicit site URL, else Vercel's production domain, else local dev.
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000');
const description = 'Run “free if your team wins” promos on game day. You pay a set share of each promo order; if your team wins, the refunds are paid by us.';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'On the House — free if your team wins',
  description,
  // Transparent mark. The SVG comes first and adapts to light/dark browser chrome (dark roof on light tabs, white
  // roof on dark ones); .ico/PNG are fallbacks with the dark roof. ?v= busts browsers' stubborn favicon cache.
  icons: {
    icon: [
      { url: '/icon.svg?v=3', type: 'image/svg+xml', sizes: 'any' },
      { url: '/favicon.ico?v=3', sizes: '16x16 32x32 48x48' },
      { url: '/favicon-32.png?v=3', type: 'image/png', sizes: '32x32' },
    ],
    apple: '/apple-touch-icon.png?v=2',
  },
  openGraph: {
    title: 'On the House — free if your team wins',
    description,
    siteName: 'On the House',
    type: 'website',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'On the House: free if your team wins. You never pay the refund.' }],
  },
  twitter: { card: 'summary_large_image', title: 'On the House — free if your team wins', description, images: ['/og.png'] },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0c1510' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${shoulders.variable} ${schibsted.variable}`} suppressHydrationWarning>
      <body className="flex min-h-dvh flex-col">
        {/* Before first paint: mark JS as running (scroll reveals only hide content then). First ever visit (or /?kickoff): an entrance screen that plays the intro with sound on a tap. After that: no intro. */}
        <Script id="motion-flags" strategy="beforeInteractive">
          {`try{var d=document.documentElement;d.classList.add('js');if(/[?&]kickoff/.test(location.search)||!localStorage.getItem('oth-entered'))d.setAttribute('data-kickoff','');else d.setAttribute('data-intro-seen','')}catch(e){document.documentElement.setAttribute('data-intro-seen','')}`}
        </Script>
        <Intro />
        <SoundUnlock />
        <SiteHeader />
        <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-6 sm:px-8 sm:py-10">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
