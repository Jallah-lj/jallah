/**
 * Seeds a fresh Supabase project:
 *   1. Inserts the default CMS documents (only if the database is empty).
 *   2. Creates the public Supabase Storage bucket (when configured).
 *   3. Creates the administrator in Supabase Auth using ADMIN_EMAIL /
 *      ADMIN_PASSWORD (when configured). In local mode the admin credentials
 *      simply come from those same environment variables.
 *
 * Usage:  npm run db:seed
 */
import { createClient } from '@supabase/supabase-js';
import { ensureSeeded, prisma, defaults } from './store.ts';

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ANON = process.env.SUPABASE_ANON_KEY || '';
const BUCKET = process.env.MEDIA_BUCKET || 'media';

async function main() {
  await ensureSeeded();
  const keys = await prisma().cmsDocument.findMany({ select: { key: true } });
  console.log(`✓ CMS documents ready (${keys.filter(k => k.key !== '_meta').length} collections)`);

  if (SUPABASE_URL && SERVICE) {
    const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

    // Public storage bucket for portfolio media
    const { error: bucketError } = await admin.storage.getBucket(BUCKET);
    if (bucketError) {
      const { error } = await admin.storage.createBucket(BUCKET, { public: true });
      console.log(error ? `! Could not create bucket "${BUCKET}": ${error.message}` : `✓ Created public storage bucket "${BUCKET}"`);
    } else {
      console.log(`✓ Storage bucket "${BUCKET}" already exists`);
    }

    // Administrator account in Supabase Auth
    const email = process.env.ADMIN_EMAIL || defaults().user.email;
    const password = process.env.ADMIN_PASSWORD || '';
    if (password.length < 8) {
      console.log('! Set ADMIN_EMAIL / ADMIN_PASSWORD (min 8 chars) to create the Supabase Auth administrator');
    } else {
      const { data } = await admin.auth.admin.listUsers();
      const exists = (data?.users || []).some(u => u.email?.toLowerCase() === email.toLowerCase());
      if (exists) {
        console.log(`✓ Supabase Auth user ${email} already exists`);
      } else {
        const { error } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { name: 'Portfolio Owner' },
        });
        console.log(error ? `! Could not create auth user: ${error.message}` : `✓ Created Supabase Auth administrator ${email}`);
      }
    }
  } else {
    console.log('• Supabase not configured — using local dev auth (ADMIN_EMAIL / ADMIN_PASSWORD env vars)');
  }
  console.log('Seed complete.');
}

main().catch(e => { console.error('Seed failed:', e); process.exit(1); }).finally(() => prisma().$disconnect());
