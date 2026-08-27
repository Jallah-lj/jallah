/**
 * Generates the build-time public snapshot (client/public/portfolio.json).
 *
 * The live site always reads from the API — this snapshot is only a fallback
 * shown if the API is unreachable. Resolution order:
 *   1. Live Supabase Postgres data (when DATABASE_URL is available at build
 *      time — e.g. building on Vercel with env vars configured).
 *   2. The legacy data/database.json file (pre-Supabase installs).
 *   3. The built-in default content.
 * Never throws: a missing database must not break the build.
 */
import fs from 'node:fs';

const PRIVATE_KEYS = ['user', 'messages', 'activity', '_meta'];

function stripPrivate(data: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) if (!PRIVATE_KEYS.includes(k)) out[k] = v;
  return out;
}

async function fromDatabase() {
  // Prisma loads .env itself, so don't gate on process.env here — just try
  // the database and let callers fall back when it isn't configured/reachable.
  const { db } = await import('../server/src/store.ts');
  return stripPrivate(await db.public());
}

function fromLegacyFile() {
  try {
    const file = new URL('../data/database.json', import.meta.url);
    if (!fs.existsSync(file)) return null;
    return stripPrivate(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch { return null; }
}

async function fromDefaults() {
  const { defaults } = await import('../server/src/store.ts');
  return stripPrivate(defaults());
}

async function main() {
  let data = null, source = 'defaults';
  try { data = await fromDatabase(); if (data) source = 'database'; } catch (e: any) { console.warn(`• Live database snapshot skipped (${e.message})`); }
  if (!data) { data = fromLegacyFile(); if (data) source = 'legacy data/database.json'; }
  if (!data) data = await fromDefaults();

  const output = new URL('../client/public/portfolio.json', import.meta.url);
  fs.mkdirSync(new URL('../client/public/', import.meta.url), { recursive: true });
  fs.writeFileSync(output, JSON.stringify({ ok: true, data }));
  console.log(`Generated public portfolio fallback (source: ${source})`);
}

main();
