'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/**
 * A plain, high-contrast QR code for any URL (no logos — it should look like any shop QR).
 * Clickable: on a desktop you can't scan your own screen, so clicking opens the link in a new tab.
 */
export function Qr({ value, size = 220, className = '', clickable = true }: { value: string; size?: number | string; className?: string; clickable?: boolean }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void QRCode.toString(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#1c1917', light: '#ffffff' } }).then((s) => {
      if (!cancelled) setSvg(s);
    });
    return () => {
      cancelled = true;
    };
  }, [value]);
  const code = (
    <div
      className={`inline-block rounded-xl bg-white p-2 [&>svg]:h-full [&>svg]:w-full ${className}`}
      style={{ width: size, height: size }}
      aria-label="QR code"
      role="img"
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
  if (!clickable) return code;
  return (
    <a href={value} target="_blank" rel="noreferrer" title="Open link" className="inline-block cursor-pointer transition hover:opacity-90 print:pointer-events-none">
      {code}
    </a>
  );
}
