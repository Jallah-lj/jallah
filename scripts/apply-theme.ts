/**
 * One-off migration: writes the current default palette into the stored
 * `settings` document.
 *
 * Why this exists: the theme lives in the database (Appearance editor), so a
 * deployment that was already seeded keeps the palette it was created with —
 * editing `defaults()` alone will never repaint a live site. Run this once
 * after pulling a palette change:
 *
 *   npm run theme:apply
 *
 * Content that isn't theme-related (site title, section titles, footer text)
 * is preserved. Any manual colour edits made in the Appearance editor are
 * replaced by the defaults below.
 *
 * Never throws on a missing database: it reports and exits non-zero so the
 * operator knows the site was left untouched.
 */
import { db, defaults } from '../server/src/store.ts';

async function main() {
  const theme = defaults().settings.theme;
  const all = await db.all();
  const settings = all?.settings || {};

  await db.updateSingleton('settings', { ...settings, theme });

  console.log('✓ Appearance palette updated');
  console.log(`  mode    ${theme.mode}`);
  console.log(`  primary ${theme.primary}   background ${theme.background}   text ${theme.text}`);
  console.log('  Reload the site — a hard refresh may be needed to clear cached assets.');
}

main()
  .catch((e) => {
    console.error('Theme update failed:', e?.message || e);
    console.error('No changes were applied — check DATABASE_URL and try again.');
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import('../server/src/store.ts');
    await prisma().$disconnect().catch(() => {});
  });
