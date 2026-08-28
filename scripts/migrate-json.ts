/**
 * One-time migration: moves a pre-Supabase install (JSON file + local uploads
 * directory, e.g. from a Render deployment) into Supabase.
 *
 *   1. Uploads every file in UPLOAD_DIR (default: uploads/) to the public
 *      Supabase Storage bucket and rewrites /uploads/... URLs in the data.
 *   2. Writes every CMS collection from DATA_FILE (default:
 *      data/database.json) into Supabase Postgres, dropping the old local
 *      password hash (credentials now live in Supabase Auth).
 *
 * Usage:
 *   DATABASE_URL=... DIRECT_URL=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npm run migrate:json
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { collectionKeys, writeDocument, prisma } from '../server/src/store.ts';

const DATA_FILE = process.env.DATA_FILE || 'data/database.json';
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || 'uploads');
const BUCKET = process.env.MEDIA_BUCKET || 'media';
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/** Recursively rewrites any "/uploads/<file>" string to its Supabase public URL. */
export function rewriteUploadUrls(value: any, map: Map<string, string>): any {
  if (typeof value === 'string') {
    const m = value.match(/^\/uploads\/([^/?#]+)/);
    if (m && map.has(m[1])) {
      const base = (process.env.SUPABASE_URL || SUPABASE_URL).replace(/\/$/, '');
      const bucket = process.env.MEDIA_BUCKET || BUCKET;
      return `${base}/storage/v1/object/public/${bucket}/uploads/${map.get(m[1])}`;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(v => rewriteUploadUrls(v, map));
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[k] = rewriteUploadUrls(v, map);
    return out;
  }
  return value;
}

async function uploadFiles(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!SUPABASE_URL || !SERVICE) { console.log('• Supabase not configured — skipping file uploads (URLs left unchanged)'); return map; }
  if (!fs.existsSync(UPLOAD_DIR)) { console.log(`• No uploads directory at ${UPLOAD_DIR} — nothing to upload`); return map; }
  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

  // keep the original filenames so existing /uploads/<name> references resolve
  for (const name of fs.readdirSync(UPLOAD_DIR).filter(f => fs.statSync(path.join(UPLOAD_DIR, f)).isFile())) {
    const key = `uploads/${name}`;
    const body = fs.readFileSync(path.join(UPLOAD_DIR, name));
    const { error } = await admin.storage.from(BUCKET).upload(key, body, { upsert: true });
    if (error && !/Duplicate|already exists/i.test(error.message)) { console.warn(`! ${name}: ${error.message}`); continue; }
    map.set(name, name);
    console.log(`✓ uploaded ${name}`);
  }
  return map;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const file = path.resolve(DATA_FILE);
  if (!fs.existsSync(file)) throw new Error(`No legacy data file at ${file}`);
  const legacy = JSON.parse(fs.readFileSync(file, 'utf8'));

  const urlMap = await uploadFiles();
  const data = rewriteUploadUrls(legacy, urlMap);

  for (const key of collectionKeys) {
    if (!(key in data)) continue;
    let value = data[key];
    if (key === 'user') {
      // Credentials now live in Supabase Auth — keep profile info only.
      value = { id: 'admin', email: value.email ?? process.env.ADMIN_EMAIL, name: value.name || 'Jallah Lawuobah', role: value.role || 'ADMIN' };
    }
    await writeDocument(key, value);
    console.log(`✓ migrated collection "${key}"`);
  }
  console.log('\nDone. Next: create your Supabase Auth administrator with `npm run db:seed`, then deploy (see DEPLOYMENT.md).');
}

// Only auto-run when executed directly (`npm run migrate:json`), not when
// imported (e.g. by tests).
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) {
  main().catch(e => { console.error('Migration failed:', e); process.exit(1); }).finally(() => prisma().$disconnect());
}
