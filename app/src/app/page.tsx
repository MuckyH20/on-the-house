import Link from 'next/link';
import { Card } from '@/components/ui';

export default function Home() {
  return (
    <div className="space-y-6">
      <section className="py-6">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Run a “free if Bitcoin is up” promo — at a cost you know upfront.</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Customers pay normally and get their money back if the event happens. Every promised refund is covered by
          matching prediction-market contracts the moment the sale happens, and refunds are paid automatically.
        </p>
      </section>
      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/merchant"><Card className="h-full hover:border-brand"><div className="font-semibold">For shops →</div><p className="mt-1 text-sm text-muted">Pick an event, set your refund and budget, launch.</p></Card></Link>
        <Link href="/me"><Card className="h-full hover:border-brand"><div className="font-semibold">My refunds →</div><p className="mt-1 text-sm text-muted">See what you bought and what you got back.</p></Card></Link>
        <Card className="h-full"><div className="font-semibold">Proof of coverage</div><p className="mt-1 text-sm text-muted">Every promo has a public page showing refunds promised vs. covered.</p></Card>
      </div>
    </div>
  );
}
