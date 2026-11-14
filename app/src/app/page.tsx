import Link from 'next/link';
import { HeroScoreboard } from '@/components/HeroScoreboard';
import { ButtonLink } from '@/components/ui';

const TIMELINE = [
  {
    phase: 'Pre-game',
    lead: 'Pick a game, see your cost, launch.',
    body: 'We suggest the next game and an offer like “your order is free if they win.” You see the exact cost per sale before you start. About two minutes.',
  },
  {
    phase: 'Game on',
    lead: 'Customers scan, order and pay.',
    body: 'Print the QR sign or share the link. Staff serve by order number. Every refund is protected on Gemini’s prediction market seconds after it’s promised.',
  },
  {
    phase: 'Final whistle',
    lead: 'Win: customers are paid back. Lose: you keep every sale.',
    body: 'Refunds go out automatically, paid by us, not you. In our live test they landed 16 seconds after the final.',
  },
];

const RECEIPT = [
  { item: 'Oat latte', amount: '$4.50' },
  { item: 'Promo cost (25% chance + 10% fee)', amount: '−$1.24' },
];

export default function Home() {
  return (
    <div className="-mt-6 sm:-mt-10">
      {/* ------------------------------------------------ Floodlit hero + match timeline */}
      <section className="night on-night bleed">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-12 sm:px-8 sm:pt-20 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 lg:pb-24">
          <div className="animate-fade-up">
            <h1 className="t-display">Free if your team wins.</h1>
            <p className="mt-4 font-display text-[1.75rem] font-extrabold uppercase leading-none text-floodlight sm:text-[2.5rem]">You never pay the refund.</p>
            <p className="t-body mt-6 max-w-[34rem] text-chalk-muted">
              Cafés, bars and local shops: pack the place on game day with a promo customers love, for a small fixed cost you see
              before you start. If your team wins, the refunds are on us.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/start" variant="flood" size="lg">Start your promo <span aria-hidden="true">→</span></ButtonLink>
              <ButtonLink href="#how" variant="night" size="lg">How a game night runs</ButtonLink>
            </div>
            <p className="mt-4 text-sm text-chalk-muted">About 2 minutes · No crypto needed · Sign in with Google</p>
          </div>
          <HeroScoreboard />
        </div>

        <div id="how" className="mx-auto max-w-6xl scroll-mt-20 px-5 pb-20 sm:px-8 sm:pb-24">
          <div className="border-t border-white/10 pt-12">
            <h2 className="t-h2 max-w-xl">How a game night runs</h2>
            <ol className="mt-10 grid gap-8 md:grid-cols-3">
              {TIMELINE.map((s, i) => (
                <li key={s.phase} className="clock-step" data-final={i === TIMELINE.length - 1}>
                  <span className="clock-dot" aria-hidden="true" />
                  <h3 className="font-display text-[1.75rem] font-extrabold uppercase leading-none text-floodlight">{s.phase}</h3>
                  <p className="mt-3 font-bold text-chalk">{s.lead}</p>
                  <p className="t-small mt-1.5 max-w-sm text-chalk-muted">{s.body}</p>
                </li>
              ))}
            </ol>
            <p className="mt-12 text-sm text-chalk-muted">
              Runs on Solana, Gemini prediction markets, QuickNode and Privy. Every promise is public on-chain.
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ Cost, as the receipt it really is */}
      <section className="grid items-center gap-10 py-16 sm:py-24 lg:grid-cols-2 lg:gap-16">
        <div>
          <h2 className="t-h2">The same small cost, win or lose.</h2>
          <p className="t-body mt-5 max-w-md text-muted">
            The price comes from a live prediction market: the less likely your team is to win, the cheaper the promo. You set
            the most you’ll pay, and sales pause on their own if the price moves past it.
          </p>
          <Link href="/help" className="link mt-5 inline-block">Read the 1-minute guide →</Link>
        </div>

        <figure className="ticket mx-auto w-full max-w-md lg:mr-0" aria-label="Example receipt">
          <div className="px-6 pb-6 pt-5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-display text-2xl font-extrabold uppercase">Bean There Café</span>
              <span className="text-sm text-subtle">Game night</span>
            </div>
            <p className="mt-1 text-sm text-muted">“Your coffee’s free if the Spurs win”</p>
            <dl className="mt-5 space-y-3 text-[0.9375rem]">
              {RECEIPT.map((r) => (
                <div key={r.item} className="flex items-baseline gap-3">
                  <dt className="text-muted">{r.item}</dt>
                  <span className="flex-1 border-b border-dotted border-line-strong" aria-hidden="true" />
                  <dd className="whitespace-nowrap font-bold">{r.amount}</dd>
                </div>
              ))}
              <div className="flex items-baseline gap-3 pt-1">
                <dt className="font-bold">You keep</dt>
                <span className="flex-1" aria-hidden="true" />
                <dd className="t-score text-[2rem]">$3.26</dd>
              </div>
            </dl>
            <p className="mt-4 text-sm text-muted">100 lattes on game night: <b className="text-ink">$124</b> in promo cost, win or lose.</p>
          </div>
          <div className="ticket-tear bg-good-soft px-6 pb-5 pt-4">
            <div className="t-label text-good">If the Spurs win</div>
            <p className="mt-1 font-bold text-ink">The customer gets $4.50 back. All $450 of refunds are paid by us.</p>
          </div>
        </figure>
      </section>

      {/* ------------------------------------------------ Close */}
      <section className="flex flex-col items-start justify-between gap-6 border-t border-line pt-12 sm:flex-row sm:items-end">
        <h2 className="t-display max-w-2xl text-[3rem] sm:text-[4.5rem]">Ready for game day?</h2>
        <div className="flex flex-col gap-3 sm:flex-row">
          <ButtonLink href="/start" size="lg">Start your promo</ButtonLink>
          <ButtonLink href="/help" variant="secondary" size="lg">Read the guide</ButtonLink>
        </div>
      </section>
    </div>
  );
}
