import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

/**
 * Migrations folder: LIGAPEDIA_MIGRATIONS_DIR, else next to this source file (packages/db/drizzle),
 * else relative to a bundled app (apps/<app>/dist → packages/db/drizzle), else from the working directory.
 */
export function migrationsDir(): string {
  if (process.env.LIGAPEDIA_MIGRATIONS_DIR) return process.env.LIGAPEDIA_MIGRATIONS_DIR;
  const candidates = [
    fileURLToPath(new URL('../drizzle', import.meta.url)),
    fileURLToPath(new URL('../../../packages/db/drizzle', import.meta.url)),
    resolve(process.cwd(), 'packages/db/drizzle'),
  ];
  return candidates.find((dir) => existsSync(join(dir, 'meta', '_journal.json'))) ?? candidates[0]!;
}

/**
 * Apply pending migrations for the persistent schemas. Idempotent.
 * Uses its own short-lived connection: drizzle's postgres-js driver replaces the client's
 * date/json parsers and serializers, which would break raw queries on a shared client.
 */
export async function runMigrations(databaseUrl: string, dir = migrationsDir()): Promise<void> {
  const client = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: dir });
  } finally {
    await client.end();
  }
}
