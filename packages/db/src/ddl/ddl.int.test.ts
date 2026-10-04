import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../../../test/db';
import { grantApiRead } from '../roles';
import { CORE_TABLES, coreIndexesDDL, coreTablesDDL } from './core';
import { STATS_TABLES, statsIndexesDDL, statsTablesDDL } from './stats';

async function tablesIn(db: TestDb, schemaName: string): Promise<string[]> {
  const rows = await db.sql<{ tablename: string }[]>`
    select tablename from pg_tables where schemaname = ${schemaName} order by 1`;
  return rows.map((r) => r.tablename);
}

async function indexCount(db: TestDb, schemaName: string): Promise<number> {
  const [row] = await db.sql<{ n: number }[]>`
    select count(*)::int as n from pg_indexes where schemaname = ${schemaName}`;
  return row?.n ?? 0;
}

describe('core and stats DDL builders', () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
  });
  afterAll(async () => db.drop());

  it('creates every core table and its indexes in core_next', async () => {
    await db.sql.unsafe(coreTablesDDL('core_next'));
    expect(await tablesIn(db, 'core_next')).toEqual([...CORE_TABLES]);
    const before = await indexCount(db, 'core_next');
    await db.sql.unsafe(coreIndexesDDL('core_next'));
    expect(await indexCount(db, 'core_next')).toBeGreaterThanOrEqual(before + 16);
  });

  it('creates every stats read model with composite and trigram indexes in stats_next', async () => {
    await db.sql.unsafe(statsTablesDDL('stats_next'));
    expect(await tablesIn(db, 'stats_next')).toEqual([...STATS_TABLES]);
    await db.sql.unsafe(statsIndexesDDL('stats_next'));
    const [trgm] = await db.sql`
      select indexdef from pg_indexes
      where schemaname = 'stats_next' and tablename = 'search_index' and indexdef like '%gin_trgm_ops%'`;
    expect(trgm).toBeDefined();
    const [composite] = await db.sql`
      select indexdef from pg_indexes
      where schemaname = 'stats_next' and tablename = 'player_agg' and indexdef like '%(season_year, category, player_id)%'`;
    expect(composite).toBeDefined();
  });

  it('gives the API role SELECT but not INSERT, before and after a schema swap', async () => {
    expect(await grantApiRead(db.sql, ['core_next', 'stats_next'])).toBe(true);
    const api = postgres(db.apiUrl, { onnotice: () => {}, max: 1 });
    try {
      await expect(api`select count(*) from core_next.matches`).resolves.toBeDefined();
      await expect(api`insert into core_next.venues (id, name, display_name) values (1, 'x', 'x')`).rejects.toThrow(
        /permission denied/,
      );
      await db.sql.unsafe('ALTER SCHEMA core_next RENAME TO core; ALTER SCHEMA stats_next RENAME TO stats;');
      await expect(api`select count(*) from core.matches`).resolves.toBeDefined();
      await expect(api`select count(*) from stats.player_agg`).resolves.toBeDefined();
      await expect(api`delete from core.matches`).rejects.toThrow(/permission denied/);
      await expect(api`select count(*) from raw.responses`).rejects.toThrow(/permission denied/);
    } finally {
      await api.end();
    }
  });
});
