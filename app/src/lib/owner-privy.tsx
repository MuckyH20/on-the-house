'use client';

import { memo, useEffect, useMemo, useRef } from 'react';
import { PrivyProvider, usePrivy } from '@privy-io/react-auth';
import { useSignMessage, useSignTransaction, useWallets } from '@privy-io/react-auth/solana';
import bs58 from 'bs58';
import type { Owner } from './owner';

/**
 * Privy sign-in, loaded on demand (it's most of a page's JavaScript). It runs beside the page rather than around it,
 * so loading it later never remounts the page (a customer's cart survives tapping "Sign in"). The owner it sees is
 * published to the page through `onChange`.
 */
// memo + a stable config: when the page re-renders with the owner this publishes, Privy must not see "new"
// settings (that would re-initialise it and loop).
export const PrivyBridge = memo(function PrivyBridge({ appId, title, onChange, loginRequests }: { appId: string; title: string; onChange: (o: Owner) => void; loginRequests: number }) {
  const config = useMemo(
    () => ({
      loginMethods: ['email', 'google'] as ('email' | 'google')[],
      appearance: { walletChainType: 'solana-only' as const, accentColor: '#b45309' as const, theme: 'light' as const, landingHeader: title },
      embeddedWallets: { solana: { createOnLogin: 'users-without-wallets' as const } },
    }),
    [title],
  );
  return (
    <PrivyProvider appId={appId} config={config}>
      <PrivyOwner onChange={onChange} loginRequests={loginRequests} />
    </PrivyProvider>
  );
});

function PrivyOwner({ onChange, loginRequests }: { onChange: (o: Owner) => void; loginRequests: number }) {
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
  useEffect(() => onChange(value), [value, onChange]);

  // A "Sign in" tapped before Privy had loaded: open the login as soon as it's ready.
  const handled = useRef(0);
  useEffect(() => {
    if (!ready || loginRequests <= handled.current) return;
    handled.current = loginRequests;
    if (!authenticated) login();
  }, [ready, authenticated, loginRequests, login]);
  return null;
}
