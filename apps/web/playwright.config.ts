import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against the API serving a fixture-seeded database
 * (see apps/ingest/scripts/seed-fixtures.ts) and the Vite dev server.
 */
const apiDb = process.env.E2E_DATABASE_URL_API ?? 'postgres://ligapedia_api:api@127.0.0.1:54329/ligapedia_ui';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    locale: 'es-UY',
    timezoneId: 'America/Montevideo',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `cd ../api && DATABASE_URL_API=${apiDb} PORT=3000 npx tsx src/server.ts`,
      url: 'http://127.0.0.1:3000/api/health',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'npx vite --port 5173 --strictPort',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
