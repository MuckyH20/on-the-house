import Link from 'next/link';
import { GameCard } from '@/components/GameCard';
import { ButtonLink, Eyebrow } from '@/components/ui';
import type { Game } from '@/lib/game';

const MOCK_GAME: Game = {
  team: 'Bitcoin',
  emoji: '🟠',
  mark: '₿',
  color: '#f7931a',
  closesAt: null,
  versus: '$71,000',
  finalAt: '8 PM',
  matchup: 'Bitcoin vs. $71,000',
  winCondition: 'Bitcoin finishes at or above $71,000',
  condition: 'Bitcoin finishes at or above $71,000 at 8 PM',
};

const STEPS = [
  { n: '1', title: 'Pick a game', body: 'We suggest the next one and an offer — like “your order is free if they win.” You see the exact cost first.' },
  { n: '2', title: 'Put it on your counter', body: 'Print the QR sign or share the link. Customers order and pay on their phone; staff serve by order number.' },
  { n: '3', title: 'We cover the refunds', body: 'Every refund is protected the moment it’s promised. If your team wins, customers are paid back automatically.' },
];

export default function Home() {
  return (
    <div className="-mt-2 space-y-20 sm:-mt-4 sm:space-y-24">
      <div className="space-y-12 sm:space-y-16">
      {/* ------------------------------------------------------------- Hero */}
      <section className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
        <div className="animate-fade-up">
          <Eyebrow>For cafés, bars &amp; local shops</Eyebrow>
          <h1 className="t-display mt-4">
            Free if your team wins.
            <br />
            <span className="text-subtle">Zero risk to you.</span>
          </h1>
          <p className="t-body mt-5 max-w-lg text-lg text-muted">
            Pack your shop on game day with a promo customers love — for a small, fixed cost you see before you start. If your team
            wins, we pay the refunds, not you.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/start" size="lg">Start your promo <span aria-hidden="true">→</span></ButtonLink>
            <ButtonLink href="#how" variant="secondary" size="lg">See how it works</ButtonLink>
          </div>
          <p className="mt-3 text-sm text-subtle">Takes about 2 minutes · No crypto needed · Sign in with Google</p>
        </div>

        {/* Phone mockup of a real promo page */}
        <div className="panel-warm relative mx-auto w-full max-w-md px-6 pb-0 pt-10 sm:px-10">
          <div className="phone mx-auto w-full max-w-[300px] translate-y-px">
            <div className="phone-screen">
              <div className="space-y-3 px-4 pb-5 pt-6">
                <div className="text-center">
                  <div className="t-label text-subtle">Game-day promo</div>
                  <div className="mt-0.5 text-lg font-bold tracking-tight">Bean There Café</div>
                </div>
                <GameCard game={MOCK_GAME} offer="Your order is free" audience="customer" chance={0.25} live={false} details={false} />
                <div className="card divide-y divide-line text-sm">
                  {[
                    ['Oat latte', '$4.50'],
                    ['Cold brew', '$3.75'],
                  ].map(([n, p]) => (
                    <div key={n} className="flex items-center justify-between px-3 py-2.5">
                      <span>{n}</span>
                      <span className="tabular text-muted">{p}</span>
                    </div>
                  ))}
                </div>
                <div className="btn btn-primary btn-block pointer-events-none">Pay $4.50</div>
              </div>
            </div>
          </div>
          <div className="absolute -left-2 top-16 hidden rounded-2xl bg-card px-3 py-2 text-xs font-semibold shadow-[var(--shadow-raised)] sm:block">
            <span className="text-good">✓</span> Refund protected
          </div>
          <div className="absolute -right-3 bottom-24 hidden rounded-2xl bg-card px-3 py-2 text-xs shadow-[var(--shadow-raised)] sm:block">
            <div className="font-semibold">Order #4QVZU</div>
            <div className="text-good">Ready for pickup</div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ Built on strip */}
      <section className="border-y border-line py-6">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <span className="t-label text-subtle">Built on</span>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-lg font-semibold tracking-tight text-subtle">
            <span>Solana</span>
            <span>Gemini</span>
            <span>QuickNode</span>
            <span>Privy</span>
          </div>
        </div>
      </section>
      </div>

      {/* --------------------------------------------------------- Proof stats */}
      <section className="grid gap-4 sm:grid-cols-3">
        {[
          ['16 s', 'from the final whistle to a customer’s refund, in our live test'],
          ['100%', 'of promised refunds protected before the game ends'],
          ['$0', 'extra for you when your team wins — refunds are on us'],
        ].map(([big, small]) => (
          <div key={big} className="card p-6">
            <div className="tabular text-4xl font-extrabold tracking-tight text-brand">{big}</div>
            <p className="t-small mt-2 text-muted">{small}</p>
          </div>
        ))}
      </section>

      {/* ---------------------------------------------------------- How it works */}
      <section id="how" className="scroll-mt-24">
        <Eyebrow>How it works</Eyebrow>
        <h2 className="t-h1 mt-3 max-w-xl">Set it up before the coffee’s brewed.</h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="card card-hover p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-lg font-bold text-brand">{s.n}</div>
              <div className="t-h3 mt-4">{s.title}</div>
              <p className="t-small mt-1.5 text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* --------------------------------------------------------- Cost example */}
      <section className="grid items-start gap-8 lg:grid-cols-2 lg:gap-16">
        <div>
          <Eyebrow>Know your cost upfront</Eyebrow>
          <h2 className="t-h1 mt-3">The same small cost, win or lose.</h2>
          <p className="t-body mt-4 max-w-md text-muted">
            The price comes from a live prediction market: the less likely your team is to win, the cheaper the promo. You set the
            most you’ll pay, and sales pause automatically if prices move past it.
          </p>
        </div>
        <div className="card p-6">
          <div className="t-label text-subtle">Example · “Your coffee’s free if Bitcoin wins”</div>
          <div className="mt-4 space-y-3 text-sm">
            {[
              ['Chance Bitcoin wins (from the market)', '25%'],
              ['Your cost per $1 of sales (25% + 10% service)', '27.5¢'],
              ['On a $4.50 latte you pay', '$1.24'],
            ].map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-4 border-b border-line pb-3">
                <span className="text-muted">{k}</span>
                <span className="tabular font-semibold">{v}</span>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-4">
              <span className="font-semibold">100 lattes on game night</span>
              <span className="tabular text-2xl font-extrabold tracking-tight">$124</span>
            </div>
          </div>
          <div className="notice notice-good mt-5">If Bitcoin wins, all $450 of refunds are paid by us — not you.</div>
        </div>
      </section>

      {/* ---------------------------------------------------------- Final CTA */}
      <section className="overflow-hidden rounded-[var(--radius-panel)] bg-ink px-6 py-12 text-center text-white sm:px-12 sm:py-16">
        <h2 className="t-h1">Ready for game day?</h2>
        <p className="mx-auto mt-3 max-w-md text-white/70">Set up your shop and launch your first promo in about two minutes.</p>
        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/start" className="btn btn-lg bg-white text-ink hover:bg-brand-soft">Start your promo</Link>
          <Link href="/help" className="btn btn-lg text-white/80 hover:text-white">Read the 1-minute guide</Link>
        </div>
      </section>
    </div>
  );
}
