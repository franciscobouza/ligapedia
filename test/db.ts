import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { inject } from 'vitest';
import { createSql, runMigrations, type Sql } from '@ligapedia/db';

declare module 'vitest' {
  export interface ProvidedContext {
    pg: { host: string; port: number };
  }
}

/** The single row of a query result (throws when empty). */
export function one<T>(rows: readonly T[]): T {
  if (rows.length === 0) throw new Error('expected one row, got none');
  return rows[0]!;
}

export interface TestDb {
  name: string;
  ingestUrl: string;
  apiUrl: string;
  sql: Sql;
  drop(): Promise<void>;
}

/** Create a fresh, migrated database owned by ligapedia_ingest (like production). */
export async function createTestDb(options: { migrate?: boolean } = {}): Promise<TestDb> {
  const { host, port } = inject('pg');
  const name = `t_${randomBytes(5).toString('hex')}`;
  const admin = postgres({ host, port, user: 'postgres', password: 'postgres', database: 'postgres', onnotice: () => {} });
  await admin.unsafe(`CREATE DATABASE ${name} OWNER ligapedia_ingest`);
  await admin.unsafe(`GRANT CONNECT ON DATABASE ${name} TO ligapedia_api`);
  await admin.end();
  const ingestUrl = `postgres://ligapedia_ingest:ingest@${host}:${port}/${name}`;
  const apiUrl = `postgres://ligapedia_api:api@${host}:${port}/${name}`;
  const sql = createSql(ingestUrl, { max: 5 });
  if (options.migrate !== false) await runMigrations(ingestUrl);
  return {
    name,
    ingestUrl,
    apiUrl,
    sql,
    async drop() {
      await sql.end();
      const a = postgres({ host, port, user: 'postgres', password: 'postgres', database: 'postgres', onnotice: () => {} });
      await a.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await a.end();
    },
  };
}
