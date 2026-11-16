/**
 * Writes the engine database (shops, menus, orders, hedge fills, events) to a JSON file, to move the engine to
 * another host: upload it as `import.json` next to that host's database and it is merged on the next start.
 * Usage: pnpm db:export [out.json]   (default: engine-export.json; stop the local engine first)
 */
import { writeFileSync } from 'node:fs';
import { findRepoRoot, loadDotEnv, resolveFromRoot } from '@oth/shared/node';
import { Repo } from '../db';

process.chdir(findRepoRoot());
loadDotEnv(process.env.ENV_FILE || '.env');
const db = resolveFromRoot(process.env.DATABASE_PATH || 'engine/data/oth.sqlite');
const out = process.argv[2] || 'engine-export.json';
const dump = new Repo(db).dump();
writeFileSync(out, JSON.stringify(dump));
console.log(`wrote ${out}: ${Object.entries(dump).map(([t, rows]) => `${rows.length} ${t}`).join(', ')}`);
