import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

/**
 * CMS data layer — Supabase Postgres via Prisma.
 *
 * Every collection (profile, settings, projects, …) is one JSONB document in
 * the `CmsDocument` table. Reads fetch the live rows; writes persist the whole
 * collection atomically. This preserves the exact JSON shapes the admin UI
 * sends/receives while making the data durable on Supabase (no more ephemeral
 * files — required for Vercel's serverless filesystem).
 *
 * The store never touches the database at import time (safe to import during
 * builds); connections are made lazily per operation and the PrismaClient is
 * reused across warm serverless invocations.
 */

export const resources = ['projects','skills','experience','education','certifications','services','testimonials','posts','media','resumes','messages','activity'] as const;
export type Resource = typeof resources[number];
export const collectionKeys = ['user','profile','settings','navigation',...resources] as const;

const now = () => new Date().toISOString();
const id = () => randomUUID();

/* ------------------------------------------------------------------ */
/* Seed defaults — used once, on the very first run against an empty   */
/* database (see ensureSeeded). Existing rows are never overwritten.   */
/* ------------------------------------------------------------------ */
export function defaults(): Record<string, any> {
  return {
    // Credentials live in Supabase Auth — this document is profile info only.
    user: { id: 'admin', email: process.env.ADMIN_EMAIL || 'admin@atlas.dev', name: 'Jallah Lawuobah', role: 'ADMIN' },
    profile: { name: 'Jallah Lawuobah', title: 'Senior Software & Security Engineer', intro: 'I architect resilient digital products at the intersection of thoughtful design, cloud engineering, and application security.', bio: 'For more than eight years, I have helped ambitious teams transform complex requirements into secure, elegant software. My work spans product engineering, distributed systems, cloud infrastructure, and offensive security.', location: 'Kigali, Rwanda', email: 'hello@atlas.dev', phone: '+250 788 000 000', availability: 'Available for select projects', years: 8, heroBadge: 'Engineering secure systems that scale', primaryCta: 'Explore my work', secondaryCta: 'Let’s talk', avatar: '', socials: { github: 'https://github.com/Jallah-lj', linkedin: 'https://linkedin.com', twitter: 'https://x.com' } },
    settings: { siteTitle: 'Jallah Lawuobah — Senior Software & Security Engineer', metaDescription: 'Portfolio of Jallah Lawuobah, a senior software and security engineer in Kigali, Rwanda, building secure, resilient digital products.', sectionTitles: { projects: 'Selected work', skills: 'Technical capabilities', experience: 'Career journey', services: 'How I can help', testimonials: 'Trusted by teams', contact: 'Let’s build something exceptional' }, footerText: 'Designed and engineered with intention.', theme: { mode: 'dark', primary: '#7c6cf2', secondary: '#16c1a3', accent: '#f59e61', background: '#080a0f', surface: '#10131b', text: '#f3f4f8', muted: '#9ba3b4', border: '#242938', radius: 18, fontScale: 1, container: 1180, spacing: 96, animation: 'medium', dark: { primary: '#7c6cf2', secondary: '#16c1a3', accent: '#f59e61', background: '#080a0f', surface: '#10131b', text: '#f3f4f8', muted: '#9ba3b4', border: '#242938' }, light: { primary: '#6656dc', secondary: '#078b78', accent: '#d66d32', background: '#f7f8fb', surface: '#ffffff', text: '#171923', muted: '#626b7c', border: '#dfe3eb' } } },
    navigation: [
      { id: id(), label: 'Work', url: '#projects', enabled: true, order: 1 },
      { id: id(), label: 'Expertise', url: '#skills', enabled: true, order: 2 },
      { id: id(), label: 'Experience', url: '#experience', enabled: true, order: 3 },
      { id: id(), label: 'Contact', url: '#contact', enabled: true, order: 4 },
    ],
    projects: [
      { id: id(), name: 'Sentinel Cloud', slug: 'sentinel-cloud', shortDescription: 'Cloud security posture management, redesigned for clarity and action.', fullDescription: 'A multi-tenant security platform that turns millions of cloud signals into prioritized, actionable findings.', category: 'Cybersecurity', technologies: ['React','TypeScript','Go','PostgreSQL','Kubernetes'], featured: true, published: true, order: 1, year: '2026', role: 'Lead Engineer', image: '', results: 'Reduced mean time to remediation by 64%.', createdAt: now(), updatedAt: now() },
      { id: id(), name: 'Nexus Commerce', slug: 'nexus-commerce', shortDescription: 'A composable commerce engine powering high-volume regional marketplaces.', fullDescription: 'Event-driven commerce infrastructure with an accessible operations suite.', category: 'Platform', technologies: ['Next.js','Node.js','Kafka','AWS'], featured: true, published: true, order: 2, year: '2025', role: 'Principal Developer', image: '', results: 'Handled 12k orders per minute at peak.', createdAt: now(), updatedAt: now() },
      { id: id(), name: 'Pulse Intelligence', slug: 'pulse-intelligence', shortDescription: 'Operational analytics that helps distributed teams act in real time.', fullDescription: 'Privacy-conscious analytics and incident intelligence for modern operations teams.', category: 'Data systems', technologies: ['React','Python','ClickHouse','GCP'], featured: false, published: true, order: 3, year: '2024', role: 'Full-stack Engineer', image: '', results: 'Improved incident detection by 41%.', createdAt: now(), updatedAt: now() },
    ],
    skills: [
      ['TypeScript','Frontend',94],['React & Next.js','Frontend',92],['Node.js','Backend',90],['Go','Backend',82],['PostgreSQL','Databases',88],['AWS & Kubernetes','Cloud',85],['Application Security','Cybersecurity',91],['Systems Architecture','Architecture',93],
    ].map((x, i) => ({ id: id(), name: x[0] as string, category: x[1] as string, proficiency: x[2] as number, description: 'Production systems, patterns, and practices.', featured: i < 4, visible: true, order: i + 1, createdAt: now(), updatedAt: now() })),
    experience: [
      { id: id(), title: 'Principal Software Engineer', company: 'Northstar Systems', location: 'Kigali · Remote', startDate: '2023', endDate: 'Present', current: true, description: 'Leading platform architecture and application security across a portfolio of B2B products.', technologies: ['TypeScript','Go','AWS'], visible: true, order: 1, createdAt: now(), updatedAt: now() },
      { id: id(), title: 'Senior Full-stack Engineer', company: 'Vertex Labs', location: 'Remote', startDate: '2020', endDate: '2023', description: 'Built developer platforms and mentored a cross-functional engineering team.', technologies: ['React','Node.js','PostgreSQL'], visible: true, order: 2, createdAt: now(), updatedAt: now() },
    ],
    education: [ { id: id(), institution: 'University of Rwanda', degree: 'BSc Computer Engineering', field: 'Computer Engineering', startDate: '2013', endDate: '2017', description: 'Networks, distributed systems, and information security.', visible: true, order: 1, createdAt: now(), updatedAt: now() } ],
    certifications: [
      { id: id(), name: 'AWS Certified Security — Specialty', organization: 'Amazon Web Services', issueDate: '2025', neverExpires: false, visible: true, order: 1, createdAt: now(), updatedAt: now() },
      { id: id(), name: 'Certified Kubernetes Administrator', organization: 'Cloud Native Computing Foundation', issueDate: '2024', visible: true, order: 2, createdAt: now(), updatedAt: now() },
    ],
    services: [
      { id: id(), title: 'Product Engineering', description: 'From strategy and architecture to polished, production-ready delivery.', icon: 'Code2', features: ['Architecture','Full-stack delivery','Design systems'], visible: true, order: 1, createdAt: now(), updatedAt: now() },
      { id: id(), title: 'Security Engineering', description: 'Pragmatic security built into your product and engineering lifecycle.', icon: 'Shield', features: ['Threat modeling','Secure SDLC','Cloud reviews'], visible: true, order: 2, createdAt: now(), updatedAt: now() },
      { id: id(), title: 'Technical Advisory', description: 'Clear technical direction for teams navigating scale and complexity.', icon: 'Compass', features: ['Platform strategy','Team enablement','Due diligence'], visible: true, order: 3, createdAt: now(), updatedAt: now() },
    ],
    testimonials: [ { id: id(), name: 'Maya Chen', position: 'VP of Product', company: 'Northstar', testimonial: 'Jallah brings rare depth across product, systems, and security. The result is software that is both elegant and genuinely resilient.', rating: 5, published: true, order: 1, createdAt: now(), updatedAt: now() } ],
    posts: [ { id: id(), title: 'Designing secure systems without slowing teams down', slug: 'secure-systems', excerpt: 'A practical framework for making security a product capability.', content: 'Security works best when it is part of everyday engineering decisions.', status: 'published', published: true, readingTime: 6, tags: ['Security','Engineering'], createdAt: now(), updatedAt: now() } ],
    media: [], resumes: [], messages: [], activity: [],
  };
}

/* ------------------------------------------------------------------ */
/* Prisma client (lazy, reused across warm invocations)                */
/* ------------------------------------------------------------------ */
const globalForPrisma = globalThis as unknown as { __cmsPrisma?: PrismaClient };
export function prisma(): PrismaClient {
  if (!globalForPrisma.__cmsPrisma) globalForPrisma.__cmsPrisma = new PrismaClient();
  return globalForPrisma.__cmsPrisma;
}

/* ------------------------------------------------------------------ */
/* Document helpers                                                    */
/* ------------------------------------------------------------------ */
export async function readDocument(key: string): Promise<any | null> {
  const row = await prisma().cmsDocument.findUnique({ where: { key } });
  return row ? row.value : null;
}

export async function writeDocument(key: string, value: any): Promise<void> {
  await prisma().cmsDocument.upsert({
    where: { key },
    update: { value: value as any },
    create: { key, value: value as any },
  });
}

let seededThisProcess = false;
/** Inserts the seed defaults exactly once, on a brand-new database. */
export async function ensureSeeded(): Promise<void> {
  if (seededThisProcess) return;
  const meta = await prisma().cmsDocument.findUnique({ where: { key: '_meta' } });
  if (!meta) {
    const seed = defaults();
    for (const key of Object.keys(seed)) {
      await prisma().cmsDocument.upsert({
        where: { key },
        update: {},
        create: { key, value: seed[key] as any },
      });
    }
    await prisma().cmsDocument.upsert({
      where: { key: '_meta' },
      update: {},
      create: { key: '_meta', value: { seededAt: now(), engine: 'supabase-postgres' } },
    });
  }
  seededThisProcess = true;
}

async function activity(action: string | null, subject: string): Promise<void> {
  if (!action) return;
  const rows = (await readDocument('activity')) || [];
  rows.unshift({ id: id(), action, subject, createdAt: now() });
  await writeDocument('activity', rows.slice(0, 100));
}

/* ------------------------------------------------------------------ */
/* Public data store — same interface the API has always used, async.  */
/* ------------------------------------------------------------------ */
export const db = {
  /** Full dataset (admin only). */
  async all(): Promise<Record<string, any>> {
    await ensureSeeded();
    const rows = await prisma().cmsDocument.findMany();
    const data: Record<string, any> = defaults();
    for (const row of rows) if (row.key !== '_meta') data[row.key] = row.value;
    return data;
  },

  /** Public portfolio payload — never exposes user, messages or activity. */
  async public(): Promise<Record<string, any>> {
    const { user, messages, activity, ...safe } = await this.all();
    return safe;
  },

  /** Everything needed by the admin dashboard in one round-trip. */
  async dashboard() {
    const data = await this.all();
    return {
      counts: Object.fromEntries(resources.map(r => [r, (data[r] || []).length])),
      recentMessages: (data.messages || []).slice(0, 4),
      activity: (data.activity || []).slice(0, 8),
    };
  },

  async getUser() { await ensureSeeded(); return (await readDocument('user')) || defaults().user; },
  async saveUser(user: any) { await writeDocument('user', { ...user, updatedAt: now() }); },

  async list(r: Resource) { await ensureSeeded(); return (await readDocument(r)) || []; },

  async create(r: Resource, value: any) {
    const rows = (await readDocument(r)) || [];
    const item = { ...value, id: id(), createdAt: now(), updatedAt: now() };
    rows.push(item);
    await writeDocument(r, rows);
    await activity(r === 'activity' ? null : `Created ${r.slice(0, -1)}`, item.name || item.title || item.id);
    return item;
  },

  async update(r: Resource, itemId: string, value: any) {
    const rows = (await readDocument(r)) || [];
    const i = rows.findIndex((x: any) => x.id === itemId);
    if (i < 0) return null;
    rows[i] = { ...rows[i], ...value, id: itemId, updatedAt: now() };
    await writeDocument(r, rows);
    await activity(`Updated ${r.slice(0, -1)}`, rows[i].name || rows[i].title || itemId);
    return rows[i];
  },

  async remove(r: Resource, itemId: string) {
    const rows = (await readDocument(r)) || [];
    const i = rows.findIndex((x: any) => x.id === itemId);
    if (i < 0) return null;
    const [item] = rows.splice(i, 1);
    await writeDocument(r, rows);
    await activity(`Deleted ${r.slice(0, -1)}`, item.name || item.title || itemId);
    return item;
  },

  async reorder(r: Resource, ids: string[]) {
    const rows = (await readDocument(r)) || [];
    const map = new Map(ids.map((v, i) => [v, i + 1]));
    rows.forEach((x: any) => { if (map.has(x.id)) x.order = map.get(x.id); });
    await writeDocument(r, rows);
    return rows;
  },

  /** Singleton merge for profile / settings. */
  async updateSingleton(key: 'profile' | 'settings', value: any) {
    const current = (await readDocument(key)) ?? defaults()[key] ?? {};
    const next = { ...current, ...value, updatedAt: now() };
    await writeDocument(key, next);
    return next;
  },

  /** Replaces the whole navigation array. */
  async setNavigation(items: any[]) {
    const next = items.map((x, i) => ({ ...x, id: x.id || id(), order: x.order ?? i + 1, updatedAt: now() }));
    await writeDocument('navigation', next);
    return next;
  },
};
