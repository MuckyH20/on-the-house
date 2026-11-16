import Link from 'next/link';
import { Mark } from '@/components/Brand';
import { HeroScoreboard } from '@/components/HeroScoreboard';
import { JumpLink } from '@/components/JumpLink';
import { Reveal } from '@/components/Reveal';
import { Ribbon } from '@/components/Ribbon';
import { ButtonLink } from '@/components/ui';

const TIMELINE = [
  {
    phase: 'Before the game',
    lead: 'You set it up in about two minutes.',
    body: 'Pick a game and an offer, like “your order is free if the Spurs win.” You see your exact cost per sale before you launch. Then put the QR sign on your counter.',
  },
  {
    phase: 'During the game',
    lead: 'Customers order and pay on their phone. You get paid right away.',
    body: 'They scan the sign, order and pay. Your share lands in your account instantly, and staff hand over each order by its number. Every refund you’ve promised is covered on Gemini’s prediction market within seconds.',
  },
  {
    phase: 'After the final',
    lead: 'Win: every customer gets their refund, paid by us. Lose: you keep every sale.',
    body: 'Refunds go back automatically to the phone each customer paid with, seconds after the result. Either way, the promo cost is the only thing you ever pay.',
  },
];

const FAQ = [
  {
    q: 'Why can you pay the refunds?',
    a: 'For every refund you promise, we buy a matching contract on Gemini’s prediction market that pays out if your team wins. If they win, that payout covers the refunds. Your promo cost is what pays for those contracts.',
  },
  {
    q: 'Does it cost me on every sale?',
    a: 'Only on orders made through your promo page. Everything else at your counter works as usual. You see the cost per promo order before you launch, and you set the most you’ll ever pay.',
  },
  {
    q: 'What games can I pick?',
    a: 'Games come from Gemini’s prediction markets, where the price shows the odds. In this demo they’re crypto-price games like “Bitcoin vs. $64,000”. Any yes-or-no event with a market price works the same way, including sports.',
  },
  {
    q: 'Do I need new equipment or crypto?',
    a: 'No. You sign in with Google. Customers order on their own phone from your QR sign, and staff use the Orders screen on any phone or tablet. No crypto for you or your customers.',
  },
];

const RECEIPT = [
  { item: 'Oat latte', amount: '$4.50' },
  { item: 'Promo cost (27.5% of the sale)', amount: '−$1.24' },
];

export default function Home() {
  return (
    <div className="landing -mt-6 sm:-mt-10">
      {/* ------------------------------------------------ Floodlit hero + match timeline */}
      <section className="night on-night bleed">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-12 sm:px-8 sm:pt-20 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 lg:pb-24">
          <div>
            <h1 className="t-display enter enter-1">Free if your team wins.</h1>
            <p className="enter enter-2 mt-4 font-display text-[1.75rem] font-extrabold uppercase leading-none text-floodlight sm:text-[2.5rem]">You never pay the refund.</p>
            <p className="t-body enter enter-3 mt-6 max-w-[34rem] text-chalk-muted">
              Cafés, bars and local shops: run a “free if your team wins” promo on game day. You pay a set share of each promo
              order, locked in before you start. If your team wins, every customer’s refund is paid by us.
            </p>
            <div className="enter enter-4 mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/start" variant="flood" size="lg">Start your promo <span className="btn-arrow" aria-hidden="true">→</span></ButtonLink>
              <JumpLink to="how" className="btn btn-night btn-lg">How it works</JumpLink>
            </div>
            <p className="enter enter-4 mt-4 text-sm text-chalk-muted">About 2 minutes · No crypto needed · Sign in with Google</p>
          </div>
          <HeroScoreboard className="enter-board" />
        </div>

        <Ribbon />

        <div id="how" className="mx-auto max-w-6xl scroll-mt-20 px-5 pb-20 sm:px-8 sm:pb-24">
          <div className="pt-16">
            <Reveal as="h2" className="t-h2 reveal max-w-xl">How a game night works</Reveal>
            <Reveal as="ol" className="clock-line reveal-stagger mt-10 grid gap-8 md:grid-cols-3">
              {TIMELINE.map((s, i) => (
                <li key={s.phase} className="clock-step" data-final={i === TIMELINE.length - 1}>
                  <span className="clock-dot" aria-hidden="true" />
                  <h3 className="font-display text-[1.75rem] font-extrabold uppercase leading-none text-floodlight">{s.phase}</h3>
                  <p className="mt-3 font-bold text-chalk">{s.lead}</p>
                  <p className="t-small mt-1.5 max-w-sm text-chalk-muted">{s.body}</p>
                </li>
              ))}
            </Reveal>
            <p className="mt-12 text-sm text-chalk-muted">
              Runs on Solana, Gemini prediction markets, QuickNode and Privy. Every promise is public on-chain.
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ Cost, as the receipt it really is */}
      <section className="grid items-center gap-10 py-16 sm:py-24 lg:grid-cols-2 lg:gap-16">
        <Reveal className="reveal">
          <h2 className="t-h2">The same small cost, win or lose.</h2>
          <p className="t-body mt-5 max-w-md text-muted">
            The price comes from a live prediction market: the less likely your team is to win, the cheaper the promo. You set
            the most you’ll pay, and sales pause on their own if the price moves past it.
          </p>
          <Link href="/help" className="link mt-5 inline-block">Read the 1-minute guide →</Link>
        </Reveal>

        <Reveal className="mx-auto w-full max-w-md lg:mr-0">
        <figure className="ticket print-in" aria-label="Example receipt">
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
            <p className="mt-4 text-sm text-muted">27.5% = the market’s 25% chance the Spurs win, plus our 10% fee on top.</p>
            <p className="mt-1 text-sm text-muted">100 promo lattes on game night: <b className="text-ink">$124</b> in promo cost, win or lose.</p>
          </div>
          <div className="ticket-tear bg-good-soft px-6 pb-5 pt-4">
            <div className="t-label text-good">If the Spurs win</div>
            <p className="mt-1 font-bold text-ink">The customer gets $4.50 back. All $450 of refunds are paid by us.</p>
          </div>
          <div className="border-t border-warn/15 bg-warn-soft px-6 pb-5 pt-4">
            <div className="t-label text-warn">If the Spurs lose</div>
            <p className="mt-1 font-bold text-ink">No refunds. The customer enjoyed their latte, and you still keep $3.26 of it.</p>
          </div>
        </figure>
        </Reveal>
      </section>

      {/* ------------------------------------------------ The questions every owner asks */}
      <section className="border-t border-line py-16 sm:py-20">
        <Reveal as="h2" className="t-h2 reveal">Questions shop owners ask</Reveal>
        <Reveal as="dl" className="reveal-stagger mt-8 grid gap-x-12 gap-y-8 md:grid-cols-2">
          {FAQ.map((f) => (
            <div key={f.q}>
              <dt className="t-h3">{f.q}</dt>
              <dd className="t-body mt-2 max-w-prose text-muted">{f.a}</dd>
            </div>
          ))}
        </Reveal>
        <Link href="/help" className="link mt-8 inline-block">All questions →</Link>
      </section>

      {/* ------------------------------------------------ Close: a floodlit scoreboard, bookending the hero */}
      <section className="kickoff px-6 py-10 sm:px-12 sm:py-14">
        <Mark size={320} className="kickoff-mark" />
        <div className="flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-end">
          <div>
            <div className="board-label flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-floodlight" aria-hidden="true" />
              Kickoff
            </div>
            <Reveal as="h2" className="t-display reveal mt-3 max-w-2xl text-[3rem] sm:text-[4.5rem]">
              Ready for <span className="text-floodlight">game day?</span>
            </Reveal>
            <p className="t-body mt-3 max-w-md text-chalk-muted">Add your shop and launch your first promo in about two minutes.</p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <ButtonLink href="/start" variant="flood" size="lg">Start your promo</ButtonLink>
            <ButtonLink href="/help" variant="night" size="lg">Read the guide</ButtonLink>
          </div>
        </div>
      </section>
    </div>
  );
}
