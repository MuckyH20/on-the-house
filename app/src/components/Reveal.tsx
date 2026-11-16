'use client';

import { useEffect, useRef, type ElementType, type ReactNode } from 'react';

/**
 * Marks its element `data-shown` the first time it scrolls into view; the CSS classes (.reveal, .reveal-stagger,
 * .clock-line, .print-in in globals.css) decide what that looks like. Content stays visible without JS.
 */
export function Reveal({ as: Tag = 'div', className = '', children, ...rest }: { as?: ElementType; className?: string; children: ReactNode } & Record<string, unknown>) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!('IntersectionObserver' in window)) {
      el.setAttribute('data-shown', '');
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            el.setAttribute('data-shown', '');
            io.disconnect();
          }
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag ref={ref} className={className} {...rest}>
      {children}
    </Tag>
  );
}
