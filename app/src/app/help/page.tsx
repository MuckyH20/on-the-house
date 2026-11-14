import { ButtonLink } from '@/components/ui';

export const metadata = { title: 'Help — On the House' };

const faqs: [string, React.ReactNode][] = [
  [
    'How does it work?',
    <>
      You pick a game and an offer, like “your order is free if the Spurs win.” Every time a customer orders, we immediately
      buy a small “protection” contract on Gemini’s prediction market that pays out if your team wins. If it does, that
      payout refunds your customers. You only ever pay the cost per promo order shown before you launch.
    </>,
  ],
  [
    'What games can I pick?',
    <>
      Games come from Gemini’s prediction markets, where the price shows the odds of a yes-or-no event. In this demo
      they’re crypto-price games (“Bitcoin vs. $64,000”: does Bitcoin finish at or above $64,000?). When none are open,
      you get a clearly labeled practice game. Any event with a market price works the same way, including sports.
    </>,
  ],
  [
    'Does it cost me on every sale?',
    <>Only on orders made through your promo page. Sales at your register work exactly as before.</>,
  ],
  [
    'What if my team loses?',
    <>You keep every sale, minus the promo cost you already agreed to. Customers keep what they bought. Nothing else happens.</>,
  ],
  [
    'What if my team wins — who pays the refunds?',
    <>
      Not you. The protection we bought pays out and covers every refund, automatically. Customers get their money back
      without you lifting a finger.
    </>,
  ],
  [
    'How much does it cost?',
    <>
      Your cost per sale = refund % × the market’s chance your team wins + a 10% service fee. Example: a “free” promo on a
      game with a 25% chance costs 27.5% of each sale — $1.24 on a $4.50 latte. You always see the exact number before
      launching, and you set the most you’re willing to pay. If prices move above that, sales pause automatically until
      they come back.
    </>,
  ],
  [
    'Do I need crypto?',
    <>
      No. Sign in with email or Google. We create a secure account behind the scenes that only you control — you never
      see a wallet, a seed phrase or a token. Customers don’t need crypto either.
    </>,
  ],
  [
    'How do customers join?',
    <>
      Share your promo link, or print the QR code for your counter. Customers order from your page and get a receipt that
      says exactly what they’ll get back if your team wins.
    </>,
  ],
  [
    'Can I see that refunds are really covered?',
    <>
      Yes. Every promo has a public “protection details” page showing refunds promised vs. refunds covered, updated live,
      with a public record of every step.
    </>,
  ],
  [
    'Where does the money from my sales go?',
    <>
      Straight to your shop’s account the moment a customer pays — minus the promo cost you agreed to. “My promos” shows
      what you received for every promo. (In this demo it’s test dollars; cashing out to your bank is the next step for a
      real launch.)
    </>,
  ],
  [
    'How do my staff handle orders?',
    <>
      Open the <b>Orders</b> screen on a tablet or phone behind the counter. Each paid order appears instantly with a short
      order number and what was ordered. Tap <b>Mark ready</b>, then <b>Picked up</b> — the customer sees the status on
      their phone. It works like any order-ahead ticket.
    </>,
  ],
  [
    'What do customers need?',
    <>
      Just a phone. They scan your sign, order and pay — no app and no account. Signing in (email or Google) is optional
      and keeps their rewards on any device.
    </>,
  ],
  [
    'Can I use my own card reader or register?',
    <>
      Not yet — today customers order and pay on their phone, like order-ahead. Connecting registers like Square and Toast
      (so a promo is just a toggle) is the next step.
    </>,
  ],
  [
    'Is this gambling?',
    <>
      Customers don’t bet anything: they pay your normal price and might get money back. You pay a fixed promo cost, and
      we buy the protection on Gemini, a regulated exchange. Rules for promotions differ by state, so check yours before
      running one with real money — this isn’t legal advice.
    </>,
  ],
  [
    'Is this real money?',
    <>
      Not yet. This demo runs on test networks (Solana devnet and Gemini’s sandbox) with demo dollars. Anything simulated
      is clearly labeled.
    </>,
  ],
];

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-12 pb-6">
      <header className="text-center sm:text-left">
        <h1 className="t-h1">Everything you need, in one minute.</h1>
        <p className="t-body mt-3 text-muted">A quick start, then answers to the questions shop owners ask most.</p>
      </header>

      <section className="card p-6 sm:p-8">
        <h2 className="t-h2">Quickstart</h2>
        <ol className="mt-5 space-y-4">
          {[
            ['Sign in', 'with email or Google, then add your shop name and menu.'],
            ['Pick a game', '— we suggest the next one — and an offer. You’ll see the exact cost.'],
            ['Launch', 'and print the QR sign for your counter (or share the link).'],
            ['Serve orders', 'from the Orders screen — customers show their order number.'],
            ['That’s it.', 'If your team wins, customers are refunded automatically.'],
          ].map(([b, rest], i) => (
            <li key={b} className="flex gap-4">
              <span className="t-score flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-night-deep text-lg text-floodlight">{i + 1}</span>
              <p className="t-body pt-1 text-muted"><b className="text-ink">{b}</b> {rest}</p>
            </li>
          ))}
        </ol>
        <ButtonLink href="/start" className="mt-7">Start your promo</ButtonLink>
      </section>

      <section>
        <h2 className="t-h2">Questions</h2>
        <div className="card mt-5 divide-y divide-line overflow-hidden p-0">
          {faqs.map(([q, a]) => (
            <details key={q} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-bold transition-colors hover:bg-paper sm:px-6">
                {q}
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-paper text-muted transition-transform duration-200 group-open:rotate-45" aria-hidden="true">+</span>
              </summary>
              <p className="t-body px-5 pb-5 text-muted sm:px-6">{a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
