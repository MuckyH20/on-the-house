import Link from 'next/link';

export const metadata = { title: 'Help — On the House' };

const faqs: [string, React.ReactNode][] = [
  [
    'How does it work?',
    <>
      You pick a game and an offer, like “your order is free if Bitcoin wins.” Every time a customer orders, we immediately
      buy a small “protection” contract on Gemini’s prediction market that pays out if your team wins. If it does, that
      payout refunds your customers. You only ever pay the small, fixed cost shown before you launch.
    </>,
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
    'Is this real money?',
    <>
      Not yet. This demo runs on test networks (Solana devnet and Gemini’s sandbox) with demo dollars. Anything simulated
      is clearly labeled.
    </>,
  ],
];

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-10 pb-10">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Help</h1>
        <p className="mt-2 text-muted">Everything you need in one minute.</p>
      </header>

      <section className="rounded-2xl border border-line bg-card p-5">
        <h2 className="font-semibold">Quickstart</h2>
        <ol className="mt-3 space-y-3 text-sm">
          <li><b>1. Sign in</b> with email or Google, then add your shop name and menu.</li>
          <li><b>2. Pick a game</b> — we suggest the next one — and an offer. You’ll see the exact cost.</li>
          <li><b>3. Launch</b> and share your link or print the QR code for your counter.</li>
          <li><b>4. That’s it.</b> If your team wins, customers are refunded automatically.</li>
        </ol>
        <Link href="/start" className="mt-4 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">Start your promo</Link>
      </section>

      <section>
        <h2 className="font-semibold">Questions</h2>
        <div className="mt-3 divide-y divide-line rounded-2xl border border-line bg-card">
          {faqs.map(([q, a]) => (
            <details key={q} className="group px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between font-medium">
                {q}
                <span className="ml-3 text-muted transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
