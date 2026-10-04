import { emptyOverrides } from '@ligapedia/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, one, type TestDb } from '../../../../test/db';
import { seedArchiveFromFixtures } from '../../test/mock-source';
import { rebuildCore, type CoreBuildResult } from './index';

describe('normalizer: raw archive → core_next', () => {
  let db: TestDb;
  let first: CoreBuildResult;
  beforeAll(async () => {
    db = await createTestDb();
    await seedArchiveFromFixtures(db.sql);
    first = await rebuildCore(db.sql, emptyOverrides());
  });
  afterAll(async () => db.drop());

  it('loads every listed match, reporting those without archived details', async () => {
    const { n } = one(await db.sql<{ n: number }[]>`SELECT count(*)::int AS n FROM core_next.matches`);
    // 25 matches with details + 9 listed in the same rounds as the single-match fixtures.
    expect(n).toBe(34);
    expect(first.draft.report.missingDetails).toHaveLength(9);
    const { seasons } = one(await db.sql<{ seasons: number }[]>`SELECT count(*)::int AS seasons FROM core_next.seasons`);
    expect(seasons).toBe(21); // 2006–2026: every season with FUTSAL tournaments
  });

  it('stores match 92923 with its score, kickoff and season', async () => {
    const [m] = await db.sql`
      SELECT m.home_goals, m.away_goals, m.season_year, m.category, m.round, m.kickoff,
             h.name AS home, a.name AS away, v.name AS venue, p.source_serie, t.name AS tournament, t.kind
      FROM core_next.matches m
      JOIN core_next.teams h ON h.id = m.home_team_id
      JOIN core_next.teams a ON a.id = m.away_team_id
      JOIN core_next.venues v ON v.id = m.venue_id
      JOIN core_next.phases p ON p.id = m.phase_id
      JOIN core_next.tournaments t ON t.id = m.tournament_id
      WHERE m.id = 92923`;
    expect(m).toMatchObject({
      home_goals: 4,
      away_goals: 6,
      season_year: 2025,
      category: 'M',
      round: 1,
      home: 'UNIVERSIDAD ORT',
      away: 'ALEMAN UNIVERSITARIO',
      venue: 'G. UGAB',
      source_serie: 'APERTURA',
      tournament: 'Apertura',
      kind: 'apertura',
    });
    expect((m!.kickoff as Date).toISOString()).toBe('2025-05-16T23:45:00.000Z');
  });

  it('records captains and shirt numbers', async () => {
    const caps = await db.sql`
      SELECT a.side, a.shirt FROM core_next.appearances a WHERE a.match_id = 92923 AND a.captain ORDER BY a.side`;
    expect(caps).toEqual([
      { side: 'A', shirt: 12 },
      { side: 'H', shirt: 1 },
    ]);
  });

  it('marks the own goal of match 19906 and the walk-over of match 55623', async () => {
    const og = await db.sql`SELECT side, own_goal FROM core_next.goals WHERE match_id = 19906 AND own_goal`;
    expect(og).toEqual([{ side: 'A', own_goal: true }]);
    const [wo] = await db.sql`SELECT walk_over, home_goals, away_goals, observations FROM core_next.matches WHERE id = 55623`;
    expect(wo).toEqual({ walk_over: true, home_goals: 0, away_goals: 3, observations: 'Equipo local (CUBA) no se presenta.' });
  });

  it('groups the 2025 Apertura and stores its official standings', async () => {
    const phases = await db.sql`
      SELECT p.source_serie, p.role FROM core_next.phases p JOIN core_next.tournaments t ON t.id = p.tournament_id
      WHERE t.season_year = 2025 AND t.kind = 'apertura' ORDER BY p.sort_order`;
    expect(phases.map((p) => [p.source_serie, p.role])).toEqual([
      ['APERTURA', 'league'],
      ['APERTURA - SERIE 2', 'league'],
      ['APERTURA SERIE 1', 'league'],
      ['FINAL DEL APERTURA', 'final'],
    ]);
    const [top] = await db.sql`
      SELECT t.name, s.pts FROM core_next.standings_official s
      JOIN core_next.phases p ON p.id = s.phase_id JOIN core_next.teams t ON t.id = s.team_id
      WHERE p.season_year = 2025 AND p.source_serie = 'APERTURA' AND s.position = 1`;
    expect(top).toEqual({ name: 'BOHEMIOS FS', pts: 11 });
  });

  it('keeps registry IDs stable across rebuilds', async () => {
    const second = await rebuildCore(db.sql, emptyOverrides());
    expect([...second.ids.players]).toEqual([...first.ids.players]);
    expect([...second.ids.teams]).toEqual([...first.ids.teams]);
    expect(second.ids.created.players).toEqual([]);
    expect(first.ids.created.players.length).toBeGreaterThan(100);
  });
});
