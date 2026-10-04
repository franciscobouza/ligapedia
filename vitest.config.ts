import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['packages/*/src/**/*.test.ts', 'apps/{api,ingest}/src/**/*.test.ts'],
          exclude: ['**/*.int.test.ts', '**/node_modules/**'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['packages/*/src/**/*.int.test.ts', 'apps/{api,ingest}/src/**/*.int.test.ts'],
          globalSetup: ['./test/global-setup.ts'],
          testTimeout: 120_000,
          hookTimeout: 180_000,
          fileParallelism: false,
        },
      },
      'apps/web/vitest.config.ts',
    ],
  },
});
