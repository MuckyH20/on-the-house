'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { PrivyProvider, usePrivy } from '@privy-io/react-auth';
import { useSignMessage, useSignTransaction, useWallets } from '@privy-io/react-auth/solana';
import bs58 from 'bs58';

/**
 * The shop owner, wherever their wallet lives:
 *  - "privy": email/Google login with an embedded Solana wallet the owner controls (they sign their own promos);
 *  - "demo":  no NEXT_PUBLIC_PRIVY_APP_ID configured → the server's demo merchant signs (keeps the demo working).
 */
export interface Owner {
  mode: 'privy' | 'demo';
  ready: boolean;
  authenticated: boolean;
  address: string | null;
  label: string | null;
  login: () => void;
  logout: () => Promise<void>;
  /** Co-sign a serialized transaction (wire bytes) with the owner's wallet. Privy mode only. */
  signTransaction: ((tx: Uint8Array) => Promise<Uint8Array>) | null;
  /** Sign a UTF-8 message; returns a base58 signature. Privy mode only. */
  signMessage: ((text: string) => Promise<string>) | null;
}

const OwnerContext = createContext<Owner | null>(null);

export function useOwner(): Owner {
  const o = useContext(OwnerContext);
  if (!o) throw new Error('useOwner must be used inside <OwnerProvider>');
  return o;
}

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? '';

/** Is Privy configured (real sign-in), or is this the single demo shop? */
export const privyEnabled = () => !!PRIVY_APP_ID;

export function OwnerProvider({ children, title = 'Sign in to your shop', demo = true }: { children: ReactNode; title?: string; demo?: boolean }) {
  if (!PRIVY_APP_ID) return demo ? <DemoOwner>{children}</DemoOwner> : <NoAccount>{children}</NoAccount>;
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ['email', 'google'],
        appearance: { walletChainType: 'solana-only', accentColor: '#b45309', theme: 'light', landingHeader: title },
        embeddedWallets: { solana: { createOnLogin: 'users-without-wallets' } },
      }}
    >
      <PrivyOwner>{children}</PrivyOwner>
    </PrivyProvider>
  );
}

function PrivyOwner({ children }: { children: ReactNode }) {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { signTransaction } = useSignTransaction();
  const { signMessage } = useSignMessage();
  const wallet = wallets[0] ?? null;

  const value = useMemo<Owner>(
    () => ({
      mode: 'privy',
      ready: ready && (!authenticated || walletsReady),
      authenticated,
      address: wallet?.address ?? null,
      label: user?.email?.address ?? user?.google?.email ?? null,
      login,
      logout,
      signTransaction: wallet
        ? async (tx) => (await signTransaction({ transaction: tx, wallet, options: { uiOptions: { showWalletUIs: false } } })).signedTransaction
        : null,
      signMessage: wallet
        ? async (text) =>
            bs58.encode((await signMessage({ message: new TextEncoder().encode(text), wallet, options: { uiOptions: { showWalletUIs: false } } })).signature)
        : null,
    }),
    [ready, authenticated, walletsReady, wallet, user, login, logout, signTransaction, signMessage],
  );
  return <OwnerContext.Provider value={value}>{children}</OwnerContext.Provider>;
}

/** Customer pages without Privy: no accounts at all (device wallet only). */
function NoAccount({ children }: { children: ReactNode }) {
  const value = useMemo<Owner>(
    () => ({ mode: 'demo', ready: true, authenticated: false, address: null, label: null, login: () => {}, logout: async () => {}, signTransaction: null, signMessage: null }),
    [],
  );
  return <OwnerContext.Provider value={value}>{children}</OwnerContext.Provider>;
}

function DemoOwner({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/demo-owner')
      .then((r) => r.json())
      .then((j: { address?: string }) => setAddress(j.address ?? null))
      .catch(() => setAddress(null));
  }, []);
  const value = useMemo<Owner>(
    () => ({
      mode: 'demo',
      ready: address !== null,
      authenticated: true,
      address,
      label: 'Demo shop',
      login: () => {},
      logout: async () => {},
      signTransaction: null,
      signMessage: null,
    }),
    [address],
  );
  return <OwnerContext.Provider value={value}>{children}</OwnerContext.Provider>;
}
