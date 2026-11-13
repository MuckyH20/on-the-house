'use client';

import { OwnerProvider } from '@/lib/owner';

/** Shop-owner pages get sign-in (Privy) and the owner's wallet; customer pages stay lightweight. */
export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return <OwnerProvider>{children}</OwnerProvider>;
}
