'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useSyncExternalStore } from 'react';
import { ArrowLeft } from 'lucide-react';

/**
 * The pages visited inside the site this session, so "Back" can return to where you actually came from.
 * A fresh load (a shared link, a QR scan) starts empty, and then Back goes to the page's natural parent instead
 * of leaving the site.
 */
const trail: string[] = [];
const listeners = new Set<() => void>();
let version = 0;
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** Records in-site navigation. Mounted once in the root layout. */
export function NavTrail() {
  const path = usePathname() ?? '/';
  useEffect(() => {
    if (trail[trail.length - 1] === path) return;
    if (trail[trail.length - 2] === path) trail.pop(); // went back
    else trail.push(path);
    version++;
    listeners.forEach((fn) => fn());
  }, [path]);
  return null;
}

type Props = {
  /** Where Back goes when there's no in-site page to return to. Omit to hide Back in that case. */
  href?: string;
  /** Overrides navigation entirely (e.g. a previous step in a form). */
  onClick?: () => void;
  label?: string;
  className?: string;
};

export function BackLink({ href, onClick, label = 'Back', className = '' }: Props) {
  const router = useRouter();
  const path = usePathname() ?? '/';
  // The trail is browser-only, so the server render always uses the parent link.
  useSyncExternalStore(subscribe, () => version, () => 0);
  const canGoBack = typeof window !== 'undefined' && trail.length > 1 && trail[trail.length - 1] === path;

  const cls = `back-link print:hidden ${className}`;
  const content = (
    <>
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {label}
    </>
  );
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cls}>
        {content}
      </button>
    );
  if (canGoBack)
    return (
      <a
        href={href ?? '/'}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
          e.preventDefault();
          router.back();
        }}
        className={cls}
      >
        {content}
      </a>
    );
  if (!href) return null;
  return (
    <Link href={href} className={cls}>
      {content}
    </Link>
  );
}
