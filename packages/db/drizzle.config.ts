import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/persistent.ts',
  out: './drizzle',
  schemaFilter: ['raw', 'registry', 'ops', 'meta'],
});
