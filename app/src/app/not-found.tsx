import type { Metadata } from 'next';
import { ButtonLink } from '@/components/ui';
import { BackLink } from '@/components/BackLink';

export const metadata: Metadata = { title: 'Page not found' };

/** Any address that doesn't exist: a scoreboard "no score" and two ways out. */
export default function NotFound() {
  return (
    <div className="mx-auto max-w-md pt-6 pb-10">
      <BackLink className="mb-4" />
      <div className="board on-night px-6 py-10 text-center">
        <div className="board-label">Final</div>
        <div className="t-score mt-2 text-[4.5rem] leading-none text-floodlight">404</div>
        <h1 className="t-h2 mt-4 text-chalk">This page isn’t on the schedule</h1>
        <p className="t-small mt-2 text-chalk-muted">The link may be old or mistyped. If a shop gave it to you, ask them for a new one.</p>
      </div>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <ButtonLink href="/" block>Go to the home page</ButtonLink>
        <ButtonLink href="/help" variant="secondary" block>How it works</ButtonLink>
      </div>
    </div>
  );
}
