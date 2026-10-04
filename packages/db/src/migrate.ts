import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

export function migrationsDir(): string {
  return (
    process.env.LIGAPEDIA_MIGRATIONS_DIR ?? fileURLToPath(new URL('../drizzle', import.meta.url))
  );
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
