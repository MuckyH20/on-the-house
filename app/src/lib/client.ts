'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Connection, Keypair, Transaction } from '@solana/web3.js';
import bs58 from 'bs58';

export const ENGINE_URL = (process.env.NEXT_PUBLIC_ENGINE_URL ?? 'http://localhost:8787').replace(/\/$/, '');
export const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';

let conn: Connection | null = null;
export function connection(): Connection {
  conn ??= new Connection(RPC_URL, 'confirmed');
  return conn;
}

export async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body;
}

export const engine = <T,>(path: string, init?: RequestInit) => getJson<T>(`${ENGINE_URL}${path}`, init);

/** Poll a loader every `ms` (and on mount). Keeps the last good value on transient errors. */
export function usePoll<T>(load: () => Promise<T>, ms: number, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;
  const refresh = useCallback(async () => {
    try {
      setData(await loadRef.current());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), ms);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, refresh, ...deps]);
  return { data, error, refresh };
}

/** Subscribe to an engine SSE stream (`event: state`), falling back to polling `fallbackPath` if it drops. */
export function useEngineStream<T>(streamPath: string | null, fallbackPath: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!streamPath || !fallbackPath) return;
    let es: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let closed = false;
    const startPolling = () => {
      if (poll) return;
      const tick = () => engine<T>(fallbackPath).then(setData).then(() => setError(null)).catch((e) => setError((e as Error).message));
      void tick();
      poll = setInterval(tick, 3000);
    };
    try {
      es = new EventSource(`${ENGINE_URL}${streamPath}`);
      es.addEventListener('state', (ev) => {
        setData(JSON.parse((ev as MessageEvent).data) as T);
        setLive(true);
        setError(null);
      });
      es.onerror = () => {
        setLive(false);
        if (!closed) startPolling();
      };
    } catch {
      startPolling();
    }
    return () => {
      closed = true;
      es?.close();
      if (poll) clearInterval(poll);
    };
  }, [streamPath, fallbackPath]);
  return { data, live, error };
}

// ---------------- burner wallet ----------------

const BURNER_KEY = 'oth.burner.v1';

/** The in-browser "tap to pay" wallet: a keypair kept in localStorage. Demo money only. */
export function loadBurner(): Keypair {
  try {
    const raw = localStorage.getItem(BURNER_KEY);
    if (raw) return Keypair.fromSecretKey(bs58.decode(raw));
  } catch {
    /* fall through */
  }
  const kp = Keypair.generate();
  try {
    localStorage.setItem(BURNER_KEY, bs58.encode(kp.secretKey));
  } catch {
    /* private mode: wallet lives for this tab only */
  }
  return kp;
}

export function useBurner(): Keypair | null {
  const [kp, setKp] = useState<Keypair | null>(null);
  useEffect(() => setKp(loadBurner()), []);
  return kp;
}

/** Sign a server-built (operator-partially-signed) transaction with the burner and submit it. */
export async function signAndSend(base64Tx: string, signer: Keypair): Promise<string> {
  // No Node Buffer global in the browser: decode base64 by hand.
  const tx = Transaction.from(Uint8Array.from(atob(base64Tx), (ch) => ch.charCodeAt(0)));
  tx.partialSign(signer);
  const c = connection();
  const sig = await c.sendRawTransaction(tx.serialize(), { maxRetries: 5 });
  const bh = { blockhash: tx.recentBlockhash!, lastValidBlockHeight: tx.lastValidBlockHeight ?? (await c.getBlockHeight()) + 150 };
  const res = await c.confirmTransaction({ signature: sig, ...bh }, 'confirmed');
  if (res.value.err) throw new Error(friendlyTxError(JSON.stringify(res.value.err)));
  return sig;
}

/** Map program errors to plain language for customers. */
export function friendlyTxError(msg: string): string {
  if (/0x1770|Unauthorized/.test(msg)) return 'Payment not authorized. Please try again.';
  if (/CampaignNotOpen|0x177a/.test(msg)) return 'This promo is paused right now. Please try again in a moment.';
  if (/SalesClosed|0x177b/.test(msg)) return 'This promo has ended.';
  if (/LiabilityCapExceeded|0x177f/.test(msg)) return 'This promo is sold out.';
  if (/UnhedgedLimitExceeded|0x1780/.test(msg)) return 'Lots of orders right now — please try again in a few seconds.';
  if (/PremiumTooHigh|0x177d/.test(msg)) return 'Prices just moved. Please try again.';
  if (/insufficient funds|0x1\b/.test(msg)) return 'Not enough money in your wallet. Tap "Add $20" first.';
  return 'Payment failed. Please try again.';
}

export function short(addr: string, n = 4): string {
  return `${addr.slice(0, n)}…${addr.slice(-n)}`;
}
