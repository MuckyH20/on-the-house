'use client';

import { OwnerProvider } from '@/lib/owner';

/** Customers can optionally sign in (Privy) so their rewards follow them to any device. */
export default function RewardsLayout({ children }: { children: React.ReactNode }) {
  return (
    <OwnerProvider title="Save your rewards" demo={false}>
      {children}
    </OwnerProvider>
  );
}
