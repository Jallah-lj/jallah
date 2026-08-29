import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db, defaults, collectionKeys, resources, type Resource } from './store.ts';

/**
 * In-memory stand-in for the `CmsDocument` table. The store's Prisma client is
 * mocked so these tests exercise the real persistence logic (seeding, list /
 * create / reorder, and the public-payload redaction) without a database.
 * `vi.hoisted` makes the shared state available to both the mock factory (which
 * Vitest hoists above the imports) and to the tests themselves.
 */
const { table, PrismaClient } = vi.hoisted(() => {
  const table = new Map<string, any>();
  const cmsDocument = {
    findUnique: async ({ where }: { where: { key: string } }) =>
      table.has(where.key) ? { key: where.key, value: table.get(where.key) } : null,
    findMany: async () => [...table.entries()].map(([key, value]) => ({ key, value })),
    upsert: async ({ where, create, update }: any) => {
      if (table.has(where.key)) {
        if (update) table.set(where.key, update.value);
      } else {
        table.set(where.key, create.value);
      }
      return {};
    },
  };
  const PrismaClient = class {
    cmsDocument = cmsDocument;
  };
  return { table, PrismaClient };
});

vi.mock('@prisma/client', () => ({ PrismaClient }));

// Reset the shared in-memory table and the store's one-time seed flag between
// tests so each test starts from a clean, seeded-looking state.
beforeEach(() => {
  table.clear();
  table.set('_meta', { seededAt: 'test', engine: 'supabase-postgres' });
});

describe('defaults()', () => {
  it('contains every collection key', () => {
    const d = defaults();
    for (const key of collectionKeys) expect(d).toHaveProperty(key);
  });

  it('returns arrays for every resource collection', () => {
    const d = defaults();
    for (const r of resources) expect(Array.isArray(d[r])).toBe(true);
  });
});

describe('db.create / db.list', () => {
  it('assigns an id and timestamps and persists the row', async () => {
    const item = await db.create('projects', { name: 'New project', published: false });
    expect(item.id).toBeTruthy();
    expect(item.createdAt).toBeTruthy();
    expect(item.updatedAt).toBeTruthy();

    const rows = await db.list('projects');
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('New project');
  });
});

describe('db.reorder', () => {
  it('reassigns order to match the supplied id order', async () => {
    table.set('projects', [
      { id: 'a', name: 'A', order: 1 },
      { id: 'b', name: 'B', order: 2 },
      { id: 'c', name: 'C', order: 3 },
    ]);
    const result = await db.reorder('projects', ['c', 'a', 'b']);
    expect(result.map((x: any) => [x.id, x.order])).toEqual([
      ['a', 2],
      ['b', 3],
      ['c', 1],
    ]);
  });
});

describe('db.public()', () => {
  it('never exposes private documents (user, messages, activity)', async () => {
    table.set('user', { email: 'admin@atlas.dev' });
    table.set('messages', [{ id: 'm1', message: 'secret' }]);
    table.set('activity', [{ id: 'a1', action: 'Updated project' }]);
    table.set('projects', [{ id: 'p1', name: 'Public project', published: true }]);

    const p = await db.public();
    expect(p.user).toBeUndefined();
    expect(p.messages).toBeUndefined();
    expect(p.activity).toBeUndefined();
    // Defaults include the user/messages/activity keys — make sure they are gone.
    expect('user' in p).toBe(false);
    expect('messages' in p).toBe(false);
    expect('activity' in p).toBe(false);
    // Public content is still present.
    expect(p.projects).toEqual([{ id: 'p1', name: 'Public project', published: true }]);
  });
});

describe('db.getUser / db.saveUser', () => {
  it('saves and reads back the user document', async () => {
    await db.saveUser({ id: 'u1', email: 'owner@atlas.dev', name: 'Owner', role: 'ADMIN' });
    const u = await db.getUser();
    expect(u.email).toBe('owner@atlas.dev');
    expect(u.updatedAt).toBeTruthy();
  });

  it('falls back to the default user when none is stored', async () => {
    const u = await db.getUser();
    expect(u).toHaveProperty('email');
    expect(u).toHaveProperty('role');
  });
});

describe('resource list is stable', () => {
  it('exposes the expected CRUD collections', () => {
    expect(resources).toContain('projects');
    expect(resources).toContain('media');
    expect(resources).toContain('messages');
    expect(resources).toContain('activity' satisfies Resource);
  });
});
