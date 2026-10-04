import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, one, type TestDb } from '../../../test/db';
import { apertura2025Source, type MockSource } from '../test/mock-source';
import { runBackfill } from './backfill';
import { SourceClient } from './source/client';
import { InterruptedError } from './source/fetcher';

describe('full-tree backfill against a mock source', () => {
  let db: TestDb;
  let source: MockSource;
  beforeAll(async () => {
    db = await createTestDb();
    source = apertura2025Source();
    await source.start();
  });
  afterAll(async () => {
    await source.stop();
    await db.drop();
  });

  const client = () => new SourceClient({ baseUrl: source.baseUrl, userAgent: 'test', backoffMs: 1, attempts: 1 });

  // 1 seasons + 1 sports + 1 torneos + 1 series + 4 rounds + 4 standings + 12 partidos + 22 × 12 details
  const EXPECTED = 1 + 1 + 1 + 1 + 4 + 4 + 12 + 22 * 12;

  it('resumes an interrupted backfill without re-requesting archived keys', async () => {
    await expect(runBackfill(db.sql, client(), { stopAfter: 100 })).rejects.toBeInstanceOf(InterruptedError);
    await new Promise((ok) => setTimeout(ok, 300)); // let requests already in flight settle
    const { n: archivedFirst } = one(await db.sql<{ n: number }[]>`SELECT count(*)::int AS n FROM raw.responses`);
    expect(archivedFirst).toBe(100);

    source.hits.length = 0;
    const result = await runBackfill(db.sql, client());
    expect(result.resumed).toBe(true);
    expect(result.seasons).toEqual([112]);
    expect(result.matches).toBe(22);
    expect(result.fetcher.stats.failed).toEqual([]);
    expect(source.hits).toHaveLength(EXPECTED - 100);
    expect(result.fetcher.stats.reused).toBe(100);

    const { n } = one(await db.sql<{ n: number }[]>`SELECT count(*)::int AS n FROM raw.responses`);
    expect(n).toBe(EXPECTED);
    const { marker } = one(await db.sql<{ marker: { completedAt?: string } }[]>`SELECT value AS marker FROM ops.state WHERE key = 'backfill'`);
    expect(marker.completedAt).toBeDefined();
  });

  it('starts a fresh backfill (re-fetching everything) once the previous one completed', async () => {
    source.hits.length = 0;
    const result = await runBackfill(db.sql, client());
    expect(result.resumed).toBe(false);
    expect(source.hits).toHaveLength(EXPECTED);
    expect(result.fetcher.stats.changed).toBe(0);
  });
});
