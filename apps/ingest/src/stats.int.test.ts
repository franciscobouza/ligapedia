import { emptyOverrides } from '@ligapedia/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../../test/db';
import { seedArchiveFromFixtures } from '../test/mock-source';
import { seedSyntheticCore } from '../test/synthetic';
import { rebuildCore } from './normalize';
import { buildStats } from './stats';

describe('statistics read models (synthetic league)', () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
    await seedSyntheticCore(db.sql);
    await buildStats(db.sql, emptyOverrides());
  });
  afterAll(async () => db.drop());

  it('computes player totals', async () => {
    const [p1] = await db.sql`
      SELECT sum(apps)::int AS apps, sum(goals)::int AS goals, sum(wins)::int AS w, sum(draws)::int AS d,
             sum(losses)::int AS l, sum(captain)::int AS cap
      FROM stats_next.player_agg WHERE player_id = 1`;
    expect(p1).toEqual({ apps: 62, goals: 62, w: 57, d: 2, l: 3, cap: 62 });
    const [p2] = await db.sql`SELECT sum(goals)::int AS goals FROM stats_next.player_agg WHERE player_id = 2`;
    expect(p2?.goals).toBe(9);
  });

  it('computes team totals, and head-to-head sums equal the totals', async () => {
    const [t1] = await db.sql`
      SELECT sum(played)::int AS pj, sum(wins)::int AS w, sum(draws)::int AS d, sum(losses)::int AS l,
             sum(gf)::int AS gf, sum(ga)::int AS ga, sum(points)::int AS pts, sum(clean_sheets)::int AS cs
      FROM stats_next.team_agg WHERE team_id = 1`;
    // league: 5×(3–1) + 2–2 + 3×(1–2) + 51×(2–0); final: 5–3 and 2–2
    expect(t1).toEqual({ pj: 62, w: 57, d: 2, l: 3, gf: 15 + 2 + 3 + 102 + 7, ga: 5 + 2 + 6 + 0 + 5, pts: 57 * 3 + 2, cs: 51 });
    const totals = await db.sql`SELECT team_id, sum(played)::int AS pj, sum(gf)::int AS gf FROM stats_next.team_agg GROUP BY 1 ORDER BY 1`;
    const viaOpponents = await db.sql`SELECT team_id, sum(played)::int AS pj, sum(gf)::int AS gf FROM stats_next.team_opponent_agg GROUP BY 1 ORDER BY 1`;
    expect(viaOpponents).toEqual(totals);
    const [h2h] = await db.sql`SELECT sum(apps)::int AS pj FROM stats_next.player_opponent_agg WHERE player_id = 1 AND opponent_id = 2`;
    expect(h2h?.pj).toBe(62);
  });

  it('finds streak boundaries', async () => {
    const rows = await db.sql`
      SELECT kind, which, length, start_match_id, end_match_id FROM stats_next.streaks WHERE team_id = 1 ORDER BY kind, which`;
    const get = (kind: string, which: string) => rows.find((r) => r.kind === kind && r.which === which);
    // rounds 10–60 plus the first leg of the final (5–3)
    expect(get('win', 'longest')).toMatchObject({ length: 52, start_match_id: 1010, end_match_id: 3001 });
    expect(get('loss', 'longest')).toMatchObject({ length: 3, start_match_id: 1007, end_match_id: 1009 });
    expect(get('unbeaten', 'current')).toMatchObject({ length: 53, start_match_id: 1010, end_match_id: 3002 });
    expect(get('win', 'current')).toBeUndefined(); // last match was a draw
    expect(get('winless', 'current')).toMatchObject({ length: 1, end_match_id: 3002 });
  });

  it('records the 50th appearance and 50th goal milestones', async () => {
    const ms = await db.sql`SELECT kind, value, match_id FROM stats_next.milestones WHERE player_id = 1 ORDER BY kind, value`;
    expect(ms).toEqual(
      expect.arrayContaining([
        { kind: 'first_match', value: 1, match_id: 1001 },
        { kind: 'first_goal', value: 1, match_id: 1001 },
        { kind: 'apps', value: 50, match_id: 1050 },
        { kind: 'goals', value: 50, match_id: 1050 },
        { kind: 'best_match', value: 1, match_id: 1001 },
      ]),
    );
  });

  it('computes standings after round 2', async () => {
    const rows = await db.sql`
      SELECT position, team_id, pj, pts, gf, gc FROM stats_next.standings_by_round
      WHERE phase_id = 1 AND after_round = 2 ORDER BY position`;
    expect(rows).toEqual([
      { position: 1, team_id: 1, pj: 2, pts: 6, gf: 6, gc: 2 },
      { position: 2, team_id: 3, pj: 2, pts: 2, gf: 2, gc: 2 },
      { position: 3, team_id: 4, pj: 2, pts: 2, gf: 2, gc: 2 },
      { position: 4, team_id: 2, pj: 2, pts: 0, gf: 2, gc: 6 },
    ]);
  });

  it('crowns the two-legged final winner and the league leader', async () => {
    const champs = await db.sql`SELECT tournament_id, team_id, method FROM stats_next.champions ORDER BY 1`;
    expect(champs).toEqual([
      { tournament_id: 1, team_id: 1, method: 'league' },
      { tournament_id: 2, team_id: 1, method: 'final' },
    ]);
  });

  it('computes goal coverage', async () => {
    const [c] = await db.sql`SELECT goals_total, goals_attributed FROM stats_next.coverage WHERE tournament_id = 1`;
    // T1: 122 goals, one recorded per match (60). T2: 13 goals, 9 recorded. T3/T4: 120, none recorded.
    expect(c).toEqual({ goals_total: 122 + 13 + 120, goals_attributed: 60 + 9 });
  });
});

describe('statistics read models (real 2025 Apertura fixtures)', () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
    await seedArchiveFromFixtures(db.sql);
    await rebuildCore(db.sql, emptyOverrides());
    await buildStats(db.sql, emptyOverrides());
  });
  afterAll(async () => db.drop());

  it('computed final standings agree with the official table', async () => {
    const computed = await db.sql`
      SELECT t.name, s.pts, s.gf, s.gc FROM stats_next.standings_by_round s
      JOIN core_next.phases p ON p.id = s.phase_id JOIN core_next.teams t ON t.id = s.team_id
      WHERE p.season_year = 2025 AND p.source_serie = 'APERTURA' AND s.after_round = 5 ORDER BY s.position`;
    const official = await db.sql`
      SELECT t.name, s.pts, s.gf, s.gc FROM core_next.standings_official s
      JOIN core_next.phases p ON p.id = s.phase_id JOIN core_next.teams t ON t.id = s.team_id
      WHERE p.season_year = 2025 AND p.source_serie = 'APERTURA' ORDER BY s.position`;
    expect(computed.map((r) => r.pts)).toEqual(official.map((r) => r.pts));
    expect(computed[0]).toEqual(official[0]);
  });

  it('names ALEMAN UNIVERSITARIO 2025 Apertura champion (won the final 2–1)', async () => {
    const [c] = await db.sql`
      SELECT tm.name, c.method FROM stats_next.champions c
      JOIN core_next.tournaments t ON t.id = c.tournament_id JOIN core_next.teams tm ON tm.id = c.team_id
      WHERE t.season_year = 2025 AND t.kind = 'apertura' AND t.category = 'M'`;
    expect(c).toEqual({ name: 'ALEMAN UNIVERSITARIO', method: 'final' });
  });

  it('indexes players and teams for search', async () => {
    const [p] = await db.sql`SELECT count(*)::int AS n FROM stats_next.search_index WHERE entity_type = 'player'`;
    expect(p?.n).toBeGreaterThan(100);
    const [t] = await db.sql`SELECT label FROM stats_next.search_index WHERE norm LIKE '%hebraica%' AND entity_type = 'team' LIMIT 1`;
    expect(t?.label).toBe('Hebraica Universitario');
  });
});
