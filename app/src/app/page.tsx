import Link from 'next/link';

export default function Home() {
  return (
    <div className="mx-auto max-w-2xl space-y-14 pb-10">
      {/* Hero — readable in 10 seconds */}
      <section className="pt-6 text-center sm:pt-12">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Free if your team wins.
          <br />
          <span className="text-brand">Zero risk to you.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-md text-lg text-muted">
          Pack your shop on game day with a promo customers love — at a small, fixed cost you see before you start.
        </p>
        <Link href="/start" className="mt-7 inline-block rounded-xl bg-brand px-7 py-3.5 text-base font-semibold text-white shadow-sm hover:opacity-95">
          Start your promo
        </Link>
        <div className="mt-2 text-xs text-muted">Takes about 2 minutes · No crypto needed</div>
      </section>

      {/* How it works */}
      <section>
        <h2 className="text-center text-sm font-semibold uppercase tracking-wider text-muted">How it works</h2>
        <ol className="mt-5 grid gap-4 sm:grid-cols-3">
          {[
            ['Pick a game', 'We suggest the next one. Choose your offer — like “your order is free if they win.”'],
            ['Share your link', 'Customers order from your promo page or scan the QR code at your counter.'],
            ['We cover the refunds', 'If your team wins, customers get their money back automatically. You pay nothing extra.'],
          ].map(([title, body], i) => (
            <li key={title} className="rounded-2xl border border-line bg-card p-5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft font-bold text-brand">{i + 1}</div>
              <div className="mt-3 font-semibold">{title}</div>
              <p className="mt-1 text-sm text-muted">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Example with real cost math */}
      <section className="rounded-2xl border border-line bg-card p-5 sm:p-6">
        <h2 className="font-semibold">Example: “Your coffee’s free if Bitcoin wins”</h2>
        <p className="mt-1 text-sm text-muted">
          Tonight’s game: <b className="text-ink">Bitcoin vs. $71,000</b>, final at 8 PM. Bitcoin “wins” if it finishes at or above $71,000.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-good-soft p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-good">If Bitcoin wins</div>
            <div className="mt-1">Every customer gets their money back — automatically.</div>
          </div>
          <div className="rounded-xl bg-paper p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">If Bitcoin loses</div>
            <div className="mt-1">Customers enjoyed a fun promo. Nothing else happens.</div>
          </div>
        </div>
        <div className="mt-4 rounded-xl bg-brand-soft p-4 text-sm">
          <div className="font-semibold text-brand">What it costs you — either way</div>
          <div className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 tabular">
            <span>Chance Bitcoin wins (from the market)</span><span>25%</span>
            <span>Your cost per $1 of sales (25% + 10% service)</span><span>27.5¢</span>
            <span>On a $4.50 latte you pay</span><span className="font-semibold">$1.24</span>
            <span>On 100 lattes on game night</span><span className="font-semibold">$124</span>
          </div>
          <p className="mt-3 text-muted">
            That’s it. If Bitcoin wins, the refunds — all $450 of them — are paid by us, not you.
          </p>
        </div>
      </section>

      <section className="text-center">
        <Link href="/start" className="inline-block rounded-xl bg-brand px-7 py-3.5 text-base font-semibold text-white shadow-sm hover:opacity-95">
          Start your promo
        </Link>
        <div className="mt-3 text-sm text-muted">
          Questions? <Link href="/help" className="underline">Read the 1-minute guide</Link>
        </div>
      </section>
    </div>
  );
}
