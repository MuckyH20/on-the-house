import { existsSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * Minimal dotenv editor: updates or appends KEY=VALUE lines, keeps comments and unknown keys.
 * `set` always writes; `defaults` only fills keys that are missing or empty.
 */
export function updateEnvFile(
  path: string,
  set: Record<string, string>,
  defaults: Record<string, string> = {},
  header = '',
): { written: string[] } {
  const lines = existsSync(path) ? readFileSync(path, 'utf8').split(/\r?\n/) : header ? header.split('\n') : [];
  const present = new Map<string, number>();
  lines.forEach((line, i) => {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line);
    if (m) present.set(m[1]!, i);
  });
  const written: string[] = [];
  const apply = (key: string, value: string, force: boolean) => {
    const idx = present.get(key);
    if (idx !== undefined) {
      const current = /=(.*)$/.exec(lines[idx]!)?.[1]?.trim() ?? '';
      if (!force && current !== '') return;
      lines[idx] = `${key}=${value}`;
    } else {
      lines.push(`${key}=${value}`);
      present.set(key, lines.length - 1);
    }
    written.push(key);
  };
  for (const [k, v] of Object.entries(set)) apply(k, v, true);
  for (const [k, v] of Object.entries(defaults)) apply(k, v, false);
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  writeFileSync(path, `${lines.join('\n')}\n`, { mode: 0o600 });
  return { written };
}
