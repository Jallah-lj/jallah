#!/usr/bin/env node
/**
 * Deploy Prisma migrations without breaking builds that have no database attached.
 *
 * Why this exists:
 *   `prisma migrate deploy` hard-fails with P1012 ("Environment variable not found:
 *   DATABASE_URL") whenever the build environment has no DATABASE_URL. On Render that
 *   happens when the service was created outside the Blueprint, so the
 *   `fromDatabase: portfolio-postgres` reference in render.yaml is never injected.
 *   The API runtime currently persists through the JSON repository in
 *   server/src/store.ts and does not import Prisma Client, so a missing or
 *   unreachable database must not block shipping the app.
 *
 * Behaviour:
 *   - No DATABASE_URL            -> skip migrations, exit 0.
 *   - DATABASE_URL set, succeeds -> exit 0.
 *   - DATABASE_URL set, fails    -> warn and exit 0, unless DB_MIGRATE_STRICT=true.
 *
 * Set DB_MIGRATE_STRICT=true once the API actually reads from PostgreSQL, so that a
 * broken migration correctly fails the deploy.
 */
import { spawnSync } from 'node:child_process';

const strict = String(process.env.DB_MIGRATE_STRICT || '').toLowerCase() === 'true';
const url = (process.env.DATABASE_URL || '').trim();

const skip = (reason) => {
  console.log(`\n[db:migrate] Skipped — ${reason}.`);
  console.log('[db:migrate] The API serves data from the JSON repository (server/src/store.ts),');
  console.log('[db:migrate] so the build continues. Set DATABASE_URL to run migrations.\n');
};

if (!url) {
  if (strict) {
    console.error('\n[db:migrate] DATABASE_URL is not set and DB_MIGRATE_STRICT=true. Failing.\n');
    process.exit(1);
  }
  skip('DATABASE_URL is not set');
  process.exit(0);
}

if (!/^(postgres(ql)?|prisma):\/\//i.test(url)) {
  if (strict) {
    console.error('\n[db:migrate] DATABASE_URL is not a PostgreSQL connection string. Failing.\n');
    process.exit(1);
  }
  skip('DATABASE_URL is not a PostgreSQL connection string');
  process.exit(0);
}

console.log('[db:migrate] DATABASE_URL detected — deploying Prisma migrations…');
const result = spawnSync(
  process.execPath,
  [new URL('../node_modules/prisma/build/index.js', import.meta.url).pathname,
   'migrate', 'deploy', '--schema=./prisma/schema.prisma'],
  { stdio: 'inherit', env: process.env },
);

if (result.status === 0) {
  console.log('[db:migrate] Migrations deployed.');
  process.exit(0);
}

if (strict) {
  console.error('\n[db:migrate] Migration failed and DB_MIGRATE_STRICT=true. Failing the build.\n');
  process.exit(result.status ?? 1);
}

console.warn('\n[db:migrate] WARNING: migration did not complete (database unreachable or not ready).');
console.warn('[db:migrate] Continuing the build because the runtime does not read from PostgreSQL yet.');
console.warn('[db:migrate] Set DB_MIGRATE_STRICT=true to make this fatal.\n');
process.exit(0);
