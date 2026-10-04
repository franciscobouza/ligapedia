import { coreIndexesDDL, coreTablesDDL, type Sql } from '@ligapedia/db';
import { insertRows } from '../src/normalize/load';

/**
 * A small synthetic core schema with exact, hand-computable statistics:
 *  - Liga 2020 (one league phase, 60 rounds): team 1 vs team 2 and team 3 vs team 4 each round.
 *    T1–T2 scores: rounds 1–5 3–1, round 6 2–2, rounds 7–9 1–2, rounds 10–60 2–0. T3–T4 always 1–1.
 *    Player 1 (T1) scores one goal per match; player 2 (T2) one goal in rounds 1–9 (others unattributed).
 *  - Copa de Oro 2020: two-legged final T2 3–5 T1, then T1 2–2 T2 → T1 champion.
 */
export async function seedSyntheticCore(sql: Sql, schema = 'core_next'): Promise<void> {
  await sql.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await sql.unsafe(coreTablesDDL(schema));
  await insertRows(sql, schema, 'seasons', [{ code: 107, year: 2020, name: null, sport: 'FUTSAL' }]);
  await insertRows(sql, schema, 'tournaments', [
    { id: 1, key: 't1', slug: 'torneo-2020-masculino', sport: 'FUTSAL', season_code: 107, season_year: 2020, category: 'M', kind: 'liga', name: 'Torneo', sort_order: 0, start_date: null, end_date: null },
    { id: 2, key: 't2', slug: 'copa-de-oro-2020-masculino', sport: 'FUTSAL', season_code: 107, season_year: 2020, category: 'M', kind: 'oro', name: 'Copa de Oro', sort_order: 1, start_date: null, end_date: null },
  ]);
  await insertRows(sql, schema, 'phases', [
    { id: 1, key: 'p1', slug: 'liga', tournament_id: 1, season_code: 107, season_year: 2020, category: 'M', source_torneo: 'FUTSAL', source_serie: 'LIGA', name: 'Liga', role: 'league', sort_order: 0, start_date: null, end_date: null, has_official_standings: false },
    { id: 2, key: 'p2', slug: 'final-oro', tournament_id: 2, season_code: 107, season_year: 2020, category: 'M', source_torneo: 'FUTSAL', source_serie: 'FINAL ORO', name: 'Final Oro', role: 'final', sort_order: 0, start_date: null, end_date: null, has_official_standings: false },
  ]);
  await insertRows(sql, schema, 'teams', [1, 2, 3, 4].map((id) => ({ id, key: `M:T${id}`, slug: `t${id}`, category: 'M', name: `T${id}`, display_name: `Equipo ${id}` })));
  await insertRows(sql, schema, 'players', [1, 2, 3, 4].map((id) => ({ id, carne: `c${id}`, slug: `p${id}`, name: `P${id}`, display_name: `Jugador ${id}` })));
  await insertRows(sql, schema, 'player_names', [1, 2, 3, 4].map((id) => ({ player_id: id, name: `P${id}`, display_name: `Jugador ${id}`, first_year: 2020, last_year: 2020 })));

  const matches: Record<string, unknown>[] = [];
  const appearances: Record<string, unknown>[] = [];
  const goals: Record<string, unknown>[] = [];
  let goalId = 0;
  let order = 0;
  const day = (r: number) => new Date(Date.UTC(2020, 2, 1 + r, 23, 0));
  const addMatch = (id: number, phase: number, tournament: number, round: number, home: number, away: number, hg: number, ag: number, kickoff: Date) => {
    const hAttr = home === 1 || away === 1 ? (home === 1 ? Math.min(hg, 1) : 0) : 0;
    matches.push({
      id, season_code: 107, season_year: 2020, category: 'M', tournament_id: tournament, phase_id: phase, round,
      leg: null, match_number: null, kickoff, kickoff_order: ++order, details_start: null, details_end: null, venue_id: null,
      home_team_id: home, away_team_id: away, home_goals: hg, away_goals: ag,
      home_points: hg > ag ? 3 : hg === ag ? 1 : 0, away_points: ag > hg ? 3 : hg === ag ? 1 : 0,
      status: 'jugado', walk_over: false, inconsistent: false, doubtful_date: false,
      home_unattributed: 0, away_unattributed: 0, observations: null,
    });
    void hAttr;
    for (const [side, team] of [['H', home], ['A', away]] as const) {
      appearances.push({ match_id: id, player_id: team, team_id: team, side, shirt: team, captain: team === 1, seq: 0 });
    }
  };
  for (let r = 1; r <= 60; r++) {
    const [hg, ag] = r <= 5 ? [3, 1] : r === 6 ? [2, 2] : r <= 9 ? [1, 2] : [2, 0];
    addMatch(1000 + r, 1, 1, r, 1, 2, hg, ag, day(r));
    addMatch(2000 + r, 1, 1, r, 3, 4, 1, 1, day(r));
  }
  addMatch(3001, 2, 2, 1, 2, 1, 3, 5, day(61));
  addMatch(3002, 2, 2, 2, 1, 2, 2, 2, day(62));

  // Recorded goals: player 1 one goal in every T1 match; player 2 one goal in each T2 match of rounds 1–9.
  for (const m of matches) {
    const id = m.id as number;
    const t1Side = m.home_team_id === 1 ? 'H' : m.away_team_id === 1 ? 'A' : null;
    if (t1Side) goals.push({ id: ++goalId, match_id: id, side: t1Side, team_id: 1, player_id: 1, minute: 1, own_goal: false, seq: 0 });
    if (id >= 1001 && id <= 1009) goals.push({ id: ++goalId, match_id: id, side: 'A', team_id: 2, player_id: 2, minute: 1, own_goal: false, seq: 0 });
  }
  // Unattributed = score − recorded goals per side.
  for (const m of matches) {
    const rec = (side: string) => goals.filter((g) => g.match_id === m.id && g.side === side).length;
    m.home_unattributed = (m.home_goals as number) - rec('H');
    m.away_unattributed = (m.away_goals as number) - rec('A');
  }
  await insertRows(sql, schema, 'matches', matches);
  await insertRows(sql, schema, 'appearances', appearances);
  await insertRows(sql, schema, 'goals', goals);
  await sql.unsafe(coreIndexesDDL(schema));
}
