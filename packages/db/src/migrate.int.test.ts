import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../../test/db';
import { runMigrations } from './migrate';

describe('persistent schema migrations', () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb({ migrate: false });
  });
  afterAll(async () => db.drop());

  it('apply on a fresh database and create the persistent schemas', async () => {
    await runMigrations(db.ingestUrl);
    const schemas = await db.sql<{ nspname: string }[]>`
      select nspname from pg_namespace where nspname in ('raw','registry','ops','meta') order by 1`;
    expect(schemas.map((s) => s.nspname)).toEqual(['meta', 'ops', 'raw', 'registry']);
    const ext = await db.sql`select extname from pg_extension where extname in ('pg_trgm','unaccent')`;
    expect(ext).toHaveLength(2);
    const [row] = await db.sql<{ v: string }[]>`select public.f_unaccent('Náutico Peñarol') as v`;
    expect(row?.v).toBe('Nautico Penarol');
    const [ds] = await db.sql`select version from meta.dataset where id = 1`;
    expect(ds?.version).toBe(0);
  });

  it('is a no-op when re-run', async () => {
    const before = await db.sql`select count(*)::int as n from drizzle.__drizzle_migrations`;
    await runMigrations(db.ingestUrl);
    const after = await db.sql`select count(*)::int as n from drizzle.__drizzle_migrations`;
    expect(after[0]?.n).toBe(before[0]?.n);
  });
});
