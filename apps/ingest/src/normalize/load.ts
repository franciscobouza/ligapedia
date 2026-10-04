import { coreIndexesDDL, coreTablesDDL, ident, type Sql } from '@ligapedia/db';
import type { CoreDraft } from './build';
import type { IdMaps } from './ids';

type Row = Record<string, unknown>;

export async function insertRows(sql: Sql, schema: string, table: string, rows: Row[]): Promise<void> {
  if (rows.length === 0) return;
  const columns = Object.keys(rows[0]!);
  for (let i = 0; i < rows.length; i += 1000) {
    const chunk = rows.slice(i, i + 1000);
    await sql`INSERT INTO ${sql(schema)}.${sql(table)} ${sql(chunk as never, columns)}`;
  }
}

function must<K>(map: Map<K, number>, key: K, what: string): number {
  const id = map.get(key);
  if (id === undefined) throw new Error(`No registry id for ${what} ${String(key)}`);
  return id;
}

/** Create `schema` (normally core_next) and fill it from the draft. */
export async function loadCore(sql: Sql, schema: string, draft: CoreDraft, ids: IdMaps): Promise<void> {
  await sql.unsafe(`DROP SCHEMA IF EXISTS ${ident(schema)} CASCADE`);
  await sql.unsafe(coreTablesDDL(schema));
  const team = (k: string) => must(ids.teams, k, 'team');
  const player = (c: string) => must(ids.players, c, 'player');
  const phase = (k: string) => must(ids.phases, k, 'phase');
  const tournament = (k: string) => must(ids.tournaments, k, 'tournament');

  await insertRows(sql, schema, 'seasons', draft.seasons.map((s) => ({ code: s.code, year: s.year, name: s.name, sport: draft.sport })));
  await insertRows(
    sql,
    schema,
    'tournaments',
    draft.tournaments.map((t) => ({
      id: tournament(t.key),
      key: t.key,
      slug: t.slug,
      sport: draft.sport,
      season_code: t.seasonCode,
      season_year: t.seasonYear,
      category: t.category,
      kind: t.kind,
      name: t.name,
      sort_order: t.sortOrder,
      start_date: t.startDate,
      end_date: t.endDate,
    })),
  );
  await insertRows(
    sql,
    schema,
    'phases',
    draft.phases.map((p) => ({
      id: phase(p.key),
      key: p.key,
      slug: p.slug,
      tournament_id: tournament(p.tournamentKey),
      season_code: p.seasonCode,
      season_year: p.seasonYear,
      category: p.category,
      source_torneo: p.torneo,
      source_serie: p.serie,
      name: p.name,
      role: p.role,
      sort_order: p.sortOrder,
      start_date: p.startDate,
      end_date: p.endDate,
      has_official_standings: p.hasOfficialStandings,
    })),
  );
  await insertRows(
    sql,
    schema,
    'teams',
    draft.teams.map((t) => ({ id: team(t.key), key: t.key, slug: t.slug, category: t.category, name: t.name, display_name: t.displayName })),
  );
  await insertRows(sql, schema, 'team_names', draft.teams.flatMap((t) => t.names.map((name) => ({ team_id: team(t.key), name }))));
  const venueId = new Map(draft.venues.map((v, i) => [v, i + 1]));
  await insertRows(sql, schema, 'venues', draft.venues.map((v, i) => ({ id: i + 1, name: v, display_name: v })));
  await insertRows(
    sql,
    schema,
    'players',
    draft.players.map((p) => ({ id: player(p.carne), carne: p.carne, slug: p.slug, name: p.name, display_name: p.displayName })),
  );
  await insertRows(
    sql,
    schema,
    'player_names',
    draft.players.flatMap((p) =>
      p.names.map((n) => ({
        player_id: player(p.carne),
        name: n.name,
        display_name: n.displayName,
        first_year: n.firstYear,
        last_year: n.lastYear,
      })),
    ),
  );
  await insertRows(
    sql,
    schema,
    'matches',
    draft.matches.map((m) => ({
      id: m.id,
      season_code: m.seasonCode,
      season_year: m.seasonYear,
      category: m.category,
      tournament_id: tournament(m.tournamentKey),
      phase_id: phase(m.phaseKey),
      round: m.round,
      leg: m.leg,
      match_number: m.matchNumber,
      kickoff: m.kickoff,
      kickoff_order: m.kickoffOrder,
      details_start: m.detailsStart,
      details_end: m.detailsEnd,
      venue_id: m.venue ? venueId.get(m.venue)! : null,
      home_team_id: team(m.homeTeamKey),
      away_team_id: team(m.awayTeamKey),
      home_goals: m.homeGoals,
      away_goals: m.awayGoals,
      home_points: m.homePoints,
      away_points: m.awayPoints,
      status: m.status,
      walk_over: m.walkOver,
      inconsistent: m.inconsistent,
      doubtful_date: m.doubtfulDate,
      home_unattributed: m.unattributed.H,
      away_unattributed: m.unattributed.A,
      observations: m.observations,
    })),
  );
  const sideTeam = (m: CoreDraft['matches'][number], side: 'H' | 'A') => team(side === 'H' ? m.homeTeamKey : m.awayTeamKey);
  await insertRows(
    sql,
    schema,
    'appearances',
    draft.matches.flatMap((m) =>
      m.appearances.map((a) => ({
        match_id: m.id,
        player_id: player(a.carne),
        team_id: sideTeam(m, a.side),
        side: a.side,
        shirt: a.shirt,
        captain: a.captain,
        seq: a.seq,
      })),
    ),
  );
  let goalId = 0;
  await insertRows(
    sql,
    schema,
    'goals',
    draft.matches.flatMap((m) =>
      m.goals.map((g) => ({
        id: ++goalId,
        match_id: m.id,
        side: g.side,
        team_id: sideTeam(m, g.side),
        player_id: player(g.carne),
        minute: g.minute,
        own_goal: g.ownGoal,
        seq: g.seq,
      })),
    ),
  );
  let cardId = 0;
  await insertRows(
    sql,
    schema,
    'cards',
    draft.matches.flatMap((m) =>
      m.cards.map((c) => {
        const app = c.carne ? m.appearances.find((a) => a.carne === c.carne) : undefined;
        return {
          id: ++cardId,
          match_id: m.id,
          side: app?.side ?? c.side,
          team_id: sideTeam(m, app?.side ?? c.side),
          color: c.color,
          player_id: c.carne ? player(c.carne) : null,
          raw_name: c.rawName,
          observations: c.observations,
          seq: c.seq,
        };
      }),
    ),
  );
  await insertRows(
    sql,
    schema,
    'substitutions',
    draft.matches.flatMap((m) =>
      m.substitutions.map((s) => ({ match_id: m.id, side: s.side, player_out: s.out, player_in: s.in, minute: s.minute, seq: s.seq })),
    ),
  );
  await insertRows(
    sql,
    schema,
    'officials',
    draft.matches.flatMap((m) => m.officials.map((o) => ({ match_id: m.id, role: o.role, name: o.name, seq: o.seq }))),
  );
  await insertRows(
    sql,
    schema,
    'standings_official',
    draft.standings.map((s) => ({
      phase_id: phase(s.phaseKey),
      position: s.position,
      team_id: team(s.teamKey),
      pj: s.pj,
      pg: s.pg,
      pe: s.pe,
      pp: s.pp,
      gf: s.gf,
      gc: s.gc,
      pts: s.pts,
    })),
  );
  // Rounds: derived per phase.
  const rounds = new Map<string, { phase_id: number; round: number; start: string | null; end: string | null; n: number }>();
  for (const m of draft.matches) {
    const k = `${m.phaseKey}|${m.round}`;
    const day = m.kickoffLocal?.slice(0, 10) ?? null;
    const r = rounds.get(k) ?? { phase_id: phase(m.phaseKey), round: m.round, start: day, end: day, n: 0 };
    r.n++;
    if (day && (!r.start || day < r.start)) r.start = day;
    if (day && (!r.end || day > r.end)) r.end = day;
    rounds.set(k, r);
  }
  await insertRows(
    sql,
    schema,
    'rounds',
    [...rounds.values()].map((r) => ({ phase_id: r.phase_id, round: r.round, start_date: r.start, end_date: r.end, match_count: r.n })),
  );
  await sql.unsafe(coreIndexesDDL(schema));
  await sql.unsafe(`ANALYZE`);
}
