import { defineConfig } from 'vitest/config';

// Dedicated Vitest config so the server test suite is discovered from the repo
// root (the Vite config sets root: 'client', which would otherwise hide it).
// Tests target the data layer and validation — pure, DB-free logic (Prisma and
// the network are mocked where needed), so they run anywhere, including CI.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/src/**/*.test.ts'],
  },
});
