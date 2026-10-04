import { emptyOverrides, req, type DetailAction, DETAIL_ACTIONS } from '@ligapedia/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, one, type TestDb } from '../../../test/db';
import { recorded } from '../../../packages/domain/test/fixtures';
import { apertura2025Source, type MockSource } from '../test/mock-source';
import { backfillCommand, dailyCommand, rebuildCommand, type IngestContext } from './commands';
import { SourceClient } from './source/client';

/** Mock source: 2025 Apertura (code 112) plus one 2009 match (code 96, match 19906). */
function twoSeasonSource(): MockSource {
  const m = apertura2025Source();
  m.set(req.seasons(), [{ codigo: '112' }, { codigo: '96' }]);
  m.set(req.sports('96'), [{ nombre: 'FUTSAL' }]);
  m.set(req.series('96', 'MAYORES'), [{ nombre: 'Futbol Sala 1ª Rueda' }]);
  m.set(req.rounds('96', 'MAYORES', 'Futbol Sala 1ª Rueda'), [{ fecha: '2' }]);
  const row = JSON.parse(recorded(req.matches('96', 'MAYORES', 'Futbol Sala 1ª Rueda', '2')).body).find((r: { ID: string }) => r.ID === '19906');
  m.set(req.matches('96', 'MAYORES', 'Futbol Sala 1ª Rueda', '2'), [row]);
  m.set(req.standings('96', 'MAYORES', 'Futbol Sala 1ª Rueda'), []);
  return m;
}

/** Copy every detail response of `from` to a new match id. */
function cloneDetails(m: MockSource, from: string, to: string): void {
  for (const action of DETAIL_ACTIONS) {
    const r = recorded(req.detail(action as DetailAction, from));
    m.set(req.detail(action as DetailAction, to), r.body, r.status);
  }
}

describe('ingest commands and the daily refresh', () => {
  let db: TestDb;
  let source: MockSource;
  let clock = new Date('2025-07-20T15:00:00Z');
  const logs: string[] = [];
  let ctx: IngestContext;

  const version = async () => one(await db.sql<{ v: number }[]>`SELECT version AS v FROM meta.dataset`).v;
  const match = async (id: number) =>
    one(await db.sql<{ hu: number; au: number; hg: number }[]>`
      SELECT home_unattributed AS hu, away_unattributed AS au, home_goals AS hg FROM core.matches WHERE id = ${id}`);

  beforeAll(async () => {
    db = await createTestDb();
    source = twoSeasonSource();
    await source.start();
    ctx = {
      sql: db.sql,
      databaseUrl: db.ingestUrl,
      client: () => new SourceClient({ baseUrl: source.baseUrl, userAgent: 'test', backoffMs: 1, attempts: 1 }),
      overrides: emptyOverrides,
      now: () => clock,
      log: (l) => logs.push(l),
    };
    const r = await backfillCommand(ctx);
    expect(r).toMatchObject({ status: 'succeeded', exitCode: 0, datasetVersion: 1 });
  });
  afterAll(async () => {
    await source.stop();
    await db.drop();
  });

  it('6.1 lets only one command run at a time', async () => {
    const before = await version();
    const results = await Promise.all([rebuildCommand(ctx), rebuildCommand(ctx)]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual(['skipped', 'succeeded']);
    expect(results.find((r) => r.status === 'skipped')?.message).toBe('skipped: running');
    expect(await version()).toBe(before + 1);
  });

  it('6.2 refreshes at most once per Montevideo calendar day', async () => {
    clock = new Date('2026-10-03T05:59:00Z'); // 02:59 on 3 October in Montevideo (UTC−03:00)
    expect(await dailyCommand(ctx)).toMatchObject({ status: 'succeeded' });
    const hits = source.hits.length;
    clock = new Date('2026-10-03T06:05:00Z'); // 03:05, same day: the scheduled run is skipped
    expect(await dailyCommand(ctx, { scheduled: true })).toMatchObject({
      status: 'skipped',
      exitCode: 0,
      message: 'skipped: already refreshed today',
    });
    clock = new Date('2026-10-04T02:59:00Z'); // 23:59, still 3 October
    expect((await dailyCommand(ctx)).status).toBe('skipped');
    expect(source.hits.length).toBe(hits); // skipped runs never contact the source
    clock = new Date('2026-10-04T03:01:00Z'); // 00:01 on 4 October: a new day
    expect((await dailyCommand(ctx, { scheduled: true })).status).toBe('succeeded');
    const forced = await dailyCommand(ctx, { force: true }); // operator override, same day
    expect(forced.status).toBe('succeeded');
    const runs = await db.sql`
      SELECT status, montevideo_date::text AS day, trigger, forced FROM ops.ingest_runs WHERE command = 'daily' ORDER BY id`;
    expect(runs.map((r) => [r.status, r.day, r.trigger, r.forced])).toEqual([
      ['succeeded', '2026-10-03', 'manual', false],
      ['skipped', '2026-10-03', 'scheduled', false],
      ['skipped', '2026-10-03', 'manual', false],
      ['succeeded', '2026-10-04', 'scheduled', false],
      ['succeeded', '2026-10-04', 'manual', true],
    ]);
  });

  it('6.3 ingests a newly published result', async () => {
    clock = new Date('2025-07-20T15:00:00Z');
    const final = JSON.parse(recorded(req.matches('112', 'FUTSAL', 'FINAL DEL APERTURA', '1')).body);
    source.set(req.matches('112', 'FUTSAL', 'FINAL DEL APERTURA', '1'), [...final, { ...final[0], ID: '99999', Fecha_Hora: '2025-07-19 21:00:00' }]);
    cloneDetails(source, '94314', '99999');
    const r = await dailyCommand(ctx, { force: true });
    expect(r.status).toBe('succeeded');
    expect((await match(99999)).hg).toBe(2);
    expect(logs.at(-1)).toContain('details=');
  });

  it('6.3 picks up scorers loaded after the first ingestion of a recent match', async () => {
    const goals = recorded(req.detail('GolesLocatario', '94314'));
    source.set(req.detail('GolesLocatario', '94314'), '[]');
    await dailyCommand(ctx, { force: true });
    expect((await match(94314)).hu).toBe(2);
    source.set(req.detail('GolesLocatario', '94314'), goals.body); // scorers loaded 5 days later
    clock = new Date('2025-07-21T15:00:00Z');
    await dailyCommand(ctx, { force: true });
    expect((await match(94314)).hu).toBe(0);
  });

  it('6.3 detects a correction to an old season through the rotation', async () => {
    const before = await match(19906);
    const goals = JSON.parse(recorded(req.detail('GolesLocatario', '19906')).body);
    source.set(req.detail('GolesLocatario', '19906'), goals.slice(1)); // one scorer removed at the source
    clock = new Date('2025-07-22T15:00:00Z');
    const r = await dailyCommand(ctx, { force: true });
    expect(r.status).toBe('succeeded');
    // 8 home goals published as counts 1,1,2,1,3; without the first row they no longer add up to the score,
    // so the 4 remaining rows count as one goal each
    expect(before.hu).toBe(0);
    expect((await match(19906)).hu).toBe(4);
  });

  it('6.3 ingests a newly listed season without configuration changes', async () => {
    source.set(req.seasons(), [{ codigo: '114' }, { codigo: '112' }, { codigo: '96' }]);
    source.set(req.sports('114'), [{ nombre: 'FUTSAL' }]);
    source.set(req.tournaments('114'), [{ nombre: 'FUTSAL' }]);
    source.set(req.series('114', 'FUTSAL'), [{ nombre: 'APERTURA' }]);
    source.set(req.rounds('114', 'FUTSAL', 'APERTURA'), [{ fecha: '1' }]);
    const row = JSON.parse(recorded(req.matches('112', 'FUTSAL', 'APERTURA', '1')).body)[0];
    source.set(req.matches('114', 'FUTSAL', 'APERTURA', '1'), [{ ...row, ID: '120000', Fecha_Hora: '2027-05-01 21:00:00' }]);
    source.set(req.standings('114', 'FUTSAL', 'APERTURA'), []);
    cloneDetails(source, row.ID, '120000');
    const detail = JSON.parse(recorded(req.detail('cargarDetallesPartido', row.ID)).body);
    source.set(req.detail('cargarDetallesPartido', '120000'), [{ ...detail[0], temporada: 'Temporada 114 "Año 2027"' }]);
    const r = await dailyCommand(ctx, { force: true });
    expect(r).toMatchObject({ status: 'succeeded' });
    const seasons = await db.sql`SELECT year FROM core.seasons ORDER BY year`;
    expect(seasons.map((s) => s.year)).toEqual([2009, 2025, 2027]);
  });

  it('6.4 aborts without publishing when more than 20% of requests fail', async () => {
    const before = await version();
    let n = 0;
    source.fail = () => (++n % 3 === 0 ? { status: 503, body: '' } : undefined); // ~33% failures
    const r = await dailyCommand(ctx, { force: true });
    source.fail = () => undefined;
    expect(r).toMatchObject({ status: 'failed', exitCode: 1 });
    expect(r.message).toMatch(/of source requests failed/);
    expect(await version()).toBe(before);
    const last = one(await db.sql`SELECT status FROM ops.ingest_runs ORDER BY id DESC LIMIT 1`);
    expect(last.status).toBe('failed');
  });
});
