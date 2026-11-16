'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';

// Privy (and the wallet kits it bundles) loads only when a page needs it. See owner-privy.tsx.
const PrivyBridge = dynamic(() => import('./owner-privy').then((m) => m.PrivyBridge), { ssr: false });

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

/** A previous Privy sign-in on this device (Privy keeps its session in localStorage). */
function hasPrivySession(): boolean {
  try {
    return !!(localStorage.getItem('privy:token') || localStorage.getItem('privy:refresh_token'));
  } catch {
    return false;
  }
}

/**
 * Owner pages (`demo`, the default) load Privy right away: they need the owner's account. Customer pages
 * (`demo={false}`) load it only for a returning signed-in customer or when "Sign in" is tapped, so a QR scan
 * downloads far less JavaScript.
 */
export function OwnerProvider({ children, title = 'Sign in to your shop', demo = true }: { children: ReactNode; title?: string; demo?: boolean }) {
  if (!PRIVY_APP_ID) return demo ? <DemoOwner>{children}</DemoOwner> : <NoAccount>{children}</NoAccount>;
  return <LazyPrivyOwner title={title} eager={demo}>{children}</LazyPrivyOwner>;
}

function LazyPrivyOwner({ children, title, eager }: { children: ReactNode; title: string; eager: boolean }) {
  const [load, setLoad] = useState(eager);
  const [loginRequests, setLoginRequests] = useState(0);
  const [owner, setOwner] = useState<Owner | null>(null);
  useEffect(() => {
    if (!eager && hasPrivySession()) setLoad(true);
  }, [eager]);
  const requestLogin = useCallback(() => {
    setLoad(true);
    setLoginRequests((n) => n + 1);
  }, []);
  // Until Privy reports in: owner pages wait (not ready); customer pages carry on signed out.
  const placeholder = useMemo<Owner>(
    () => ({ mode: 'privy', ready: !eager, authenticated: false, address: null, label: null, login: requestLogin, logout: async () => {}, signTransaction: null, signMessage: null }),
    [eager, requestLogin],
  );
  return (
    <>
      <OwnerContext.Provider value={owner ?? placeholder}>{children}</OwnerContext.Provider>
      {load ? <PrivyBridge appId={PRIVY_APP_ID} title={title} onChange={setOwner} loginRequests={loginRequests} /> : null}
    </>
  );
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
