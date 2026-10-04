import postgres from 'postgres';
import { emptyOverrides } from '@ligapedia/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, one, type TestDb } from '../../../test/db';
import { seedArchiveFromFixtures } from '../test/mock-source';
import { rebuildCore } from './normalize';
import { buildAndPublish, GateError } from './pipeline';
import { rollback, sanityGates } from './publish';
import { emptyReport, finishRun, formatRunSummary, startRun } from './runs';

describe('sanity gates, atomic publish and rollback', () => {
  let db: TestDb;
  let api: postgres.Sql;
  beforeAll(async () => {
    db = await createTestDb();
    await seedArchiveFromFixtures(db.sql);
    api = postgres(db.apiUrl, { max: 1, onnotice: () => {} });
  });
  afterAll(async () => {
    await api.end();
    await db.drop();
  });

  it('publishes a first dataset as version 1, readable by the API role', async () => {
    const r = await buildAndPublish(db.sql, emptyOverrides(), null, emptyReport());
    expect(r.version).toBe(1);
    expect(r.counts.matches).toBe(34);
    const { n } = one(await api<{ n: number }[]>`SELECT count(*)::int AS n FROM core.matches`);
    expect(n).toBe(34);
  });

  it('swaps atomically: a pooled connection reads the new version after publish and the old after rollback', async () => {
    // Prepared statement on the pooled API connection, executed before and after the swap.
    const q = () => api<{ g: number }[]>`SELECT home_goals AS g FROM core.matches WHERE id = 92923`;
    expect((await q())[0]!.g).toBe(4);
    // A score correction arrives in the archive (listing of 2025 APERTURA round 1).
    await db.sql`
      UPDATE raw.responses SET body = replace(body, '"GL":"4","Visitante":"ALEMAN', '"GL":"7","Visitante":"ALEMAN')
      WHERE key LIKE 'detallefechas:cargarPartidos?%fecha=1%serie=APERTURA&%'`;
    const r = await buildAndPublish(db.sql, emptyOverrides(), null, emptyReport());
    expect(r.version).toBe(2);
    expect((await q())[0]!.g).toBe(7);
    const back = await rollback(db.sql, null);
    expect(back.version).toBe(3);
    expect((await q())[0]!.g).toBe(4);
  });

  it('blocks publishing when the match count drops by more than 1%', async () => {
    await db.sql`DELETE FROM raw.responses WHERE key LIKE '%cargarPartidos%serie=APERTURA&%'`;
    const report = emptyReport();
    await expect(buildAndPublish(db.sql, emptyOverrides(), null, report)).rejects.toBeInstanceOf(GateError);
    expect(report.gateFailures[0]).toMatch(/match count dropped/);
    const { version } = one(await db.sql<{ version: number }[]>`SELECT version FROM meta.dataset`);
    expect(version).toBe(3);
  });

  it('reports a season without phases and a phase with rounds but no matches', async () => {
    const { draft } = await rebuildCore(db.sql, emptyOverrides());
    const broken = {
      ...draft,
      phases: draft.phases.filter((p) => p.seasonYear !== 2006).map((p) => (p.serie === 'APERTURA' && p.seasonYear === 2025 ? { ...p, matchCount: 0 } : p)),
    };
    const gates = await sanityGates(db.sql, broken);
    expect(gates.failures).toEqual(
      expect.arrayContaining(['season 2006 has no phases', expect.stringMatching(/"APERTURA" \(2025\) lists 5 rounds but no matches/)]),
    );
  });

  it('records runs with their report and prints a summary', async () => {
    const id = await startRun(db.sql, 'daily', 'scheduled', false, new Date('2026-10-03T06:00:00Z'));
    const report = { ...emptyReport(), unknownPhases: [{ season: 106, torneo: 'FUTSAL', serie: 'SERIE 1' }], unresolvedCards: [{ matchId: 1, name: 'X', color: 'R' as const }, { matchId: 2, name: 'Y', color: 'R' as const }] };
    await finishRun(db.sql, id, { status: 'succeeded', report, counts: { matches: 34 }, datasetVersion: 3 });
    const [run] = await db.sql`SELECT status, montevideo_date::text AS montevideo_date, report, counts FROM ops.ingest_runs WHERE id = ${id}`;
    expect(run).toMatchObject({ status: 'succeeded', montevideo_date: '2026-10-03', counts: { matches: 34 } });
    expect((run!.report as typeof report).unresolvedCards).toHaveLength(2);
    const text = formatRunSummary('daily', 'succeeded', report);
    expect(text).toContain('SERIE 1');
    expect(text).toContain('match 2 roja: Y');
  });
});
