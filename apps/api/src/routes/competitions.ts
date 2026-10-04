import {
  ChampionsData,
  Envelope,
  PhaseDetail,
  SeasonDetail,
  SeasonListItem,
  TournamentDetail,
  TournamentListItem,
  type Category,
  type ChampionInfo,
  type Kind,
  type MatchSummary,
  type Role,
  type ScorerRow,
  type Standings,
  type TeamRef,
  type TournamentRef,
} from '@ligapedia/contracts';
import { Type } from 'typebox';
import type { FastifyInstance } from 'fastify';
import { filtersFrom, idParam, meta, type ApiContext } from '../context';
import { notFound } from '../errors';
import {
  and,
  matchColumns,
  matchJoins,
  playerRef,
  ratio,
  round2,
  teamRef,
  teamsById,
  toMatchSummary,
  toTournamentRef,
  type Fragment,
  type MatchRow,
} from '../queries/common';
import type { Sql } from '@ligapedia/db';

interface TournamentRow {
  t_id: number;
  t_slug: string;
  t_name: string;
  t_year: number;
  t_cat: Category;
  t_kind: Kind;
  sort_order: number;
  start_date: string | null;
  end_date: string | null;
  champ_team: number | null;
  champ_method: ChampionInfo['method'] | null;
}

async function tournamentsWhere(sql: Sql, where: Fragment): Promise<TournamentRow[]> {
  return sql<TournamentRow[]>`
    SELECT t.id AS t_id, t.slug AS t_slug, t.name AS t_name, t.season_year AS t_year, t.category AS t_cat, t.kind AS t_kind,
           t.sort_order, t.start_date::text, t.end_date::text, c.team_id AS champ_team, c.method AS champ_method
    FROM core.tournaments t LEFT JOIN stats.champions c ON c.tournament_id = t.id
    WHERE ${where}
    ORDER BY t.season_year DESC, t.category DESC, t.sort_order`;
}

function champion(row: TournamentRow, teams: Map<number, TeamRef>): ChampionInfo {
  return {
    team: row.champ_team !== null ? (teams.get(row.champ_team) ?? null) : null,
    method: row.champ_method ?? 'undetermined',
  };
}

/** Top scorers for a scope over stats.player_agg, with the teams they scored for. */
export async function topScorers(sql: Sql, where: Fragment, limit = 10): Promise<ScorerRow[]> {
  const rows = await sql<
    { player_id: number; slug: string; name: string; goals: number; apps: number; teams: Array<{ id: number; slug: string; name: string; category: Category }> }[]
  >`
    SELECT pa.player_id, p.slug, p.display_name AS name, sum(pa.goals)::int AS goals, sum(pa.apps)::int AS apps,
           json_agg(DISTINCT jsonb_build_object('id', t.id, 'slug', t.slug, 'name', t.display_name, 'category', t.category)) AS teams
    FROM stats.player_agg pa
    JOIN core.players p ON p.id = pa.player_id
    JOIN core.teams t ON t.id = pa.team_id
    WHERE ${where}
    GROUP BY pa.player_id, p.slug, p.display_name
    HAVING sum(pa.goals) > 0
    ORDER BY goals DESC, apps ASC, name ASC
    LIMIT ${limit}`;
  let rank = 0;
  let prev = -1;
  return rows.map((r, i) => {
    if (r.goals !== prev) rank = i + 1;
    prev = r.goals;
    return {
      player: playerRef(r.player_id, r.slug, r.name),
      teams: r.teams.map((t) => teamRef(t.id, t.slug, t.name, t.category)),
      goals: r.goals,
      apps: r.apps,
      rank,
    };
  });
}

interface StandingDbRow {
  position: number;
  team_id: number;
  slug: string;
  name: string;
  category: Category;
  pj: number;
  pg: number;
  pe: number;
  pp: number;
  gf: number;
  gc: number;
  pts: number;
}

const toStandingRows = (rows: StandingDbRow[]) =>
  rows.map((r) => ({
    position: r.position,
    team: teamRef(r.team_id, r.slug, r.name, r.category),
    pj: r.pj,
    pg: r.pg,
    pe: r.pe,
    pp: r.pp,
    gf: r.gf,
    gc: r.gc,
    dg: r.gf - r.gc,
    pts: r.pts,
  }));

/** Official standings when published; otherwise the computed table after the last (or given) round. One query. */
export async function phaseStandings(sql: Sql, phaseId: number, afterRound?: number): Promise<Standings | null> {
  const rows = await sql<(StandingDbRow & { kind: 'official' | 'computed'; after_round: number | null })[]>`
    WITH official AS (
      SELECT 'official'::text AS kind, NULL::int AS after_round, s.position, s.team_id, s.pj, s.pg, s.pe, s.pp, s.gf, s.gc, s.pts
      FROM core.standings_official s WHERE s.phase_id = ${phaseId} AND ${afterRound === undefined}
    ), last_round AS (
      SELECT max(after_round) AS r FROM stats.standings_by_round
      WHERE phase_id = ${phaseId} ${afterRound !== undefined ? sql`AND after_round <= ${afterRound}` : sql``}
    ), computed AS (
      SELECT 'computed'::text, s.after_round, s.position, s.team_id, s.pj, s.pg, s.pe, s.pp, s.gf, s.gc, s.pts
      FROM stats.standings_by_round s, last_round
      WHERE s.phase_id = ${phaseId} AND s.after_round = last_round.r AND NOT EXISTS (SELECT 1 FROM official)
    )
    SELECT x.*, t.slug, t.display_name AS name, t.category
    FROM (SELECT * FROM official UNION ALL SELECT * FROM computed) x JOIN core.teams t ON t.id = x.team_id
    ORDER BY x.position`;
  if (!rows.length) return null;
  const kind = rows[0]!.kind;
  return {
    type: kind,
    afterRound: kind === 'computed' && afterRound !== undefined ? rows[0]!.after_round : null,
    rows: toStandingRows(rows),
  };
}

async function matchesWhere(sql: Sql, where: Fragment, order: Fragment = sql`m.kickoff_order`): Promise<MatchSummary[]> {
  const rows = await sql<MatchRow[]>`
    SELECT ${matchColumns(sql)} FROM core.matches m ${matchJoins(sql)} WHERE ${where} ORDER BY ${order}`;
  return rows.map(toMatchSummary);
}

export async function competitionRoutes(app: FastifyInstance, ctx: ApiContext): Promise<void> {
  const { sql } = ctx;

  app.get('/api/v1/temporadas', { schema: { response: { 200: Envelope(Type.Array(SeasonListItem)) } } }, async () => {
    const [seasons, tournaments] = await Promise.all([
      sql<{ code: number; year: number; name: string | null; matches: number; goals: number; categories: Category[] }[]>`
        WITH m AS (
          SELECT season_code, count(*) FILTER (WHERE status = 'jugado')::int AS matches,
                 coalesce(sum(home_goals + away_goals) FILTER (WHERE status = 'jugado' AND NOT walk_over), 0)::int AS goals
          FROM core.matches GROUP BY season_code
        ), c AS (
          SELECT season_code, array_agg(DISTINCT category ORDER BY category DESC) AS categories
          FROM core.tournaments GROUP BY season_code
        )
        SELECT s.code, s.year, s.name, coalesce(m.matches, 0) AS matches, coalesce(m.goals, 0) AS goals,
               coalesce(c.categories, '{}') AS categories
        FROM core.seasons s LEFT JOIN m ON m.season_code = s.code LEFT JOIN c ON c.season_code = s.code
        ORDER BY s.year DESC`,
      tournamentsWhere(sql, sql`TRUE`),
    ]);
    const teams = await teamsById(sql, tournaments.map((t) => t.champ_team).filter((x): x is number => x !== null));
    return {
      data: seasons.map((s) => ({
        year: s.year,
        name: s.name,
        categories: s.categories,
        matches: s.matches,
        goals: s.goals,
        champions: tournaments
          .filter((t) => t.t_year === s.year && t.t_kind !== 'otro')
          .map((t) => ({ tournament: toTournamentRef(t), champion: champion(t, teams) })),
      })),
      meta: meta(ctx),
    };
  });

  app.get<{ Params: { year: string } }>(
    '/api/v1/temporadas/:year',
    { schema: { response: { 200: Envelope(SeasonDetail) } } },
    async (req) => {
      const year = idParam(req.params.year);
      const [seasonRows, tournaments, phases, cov, scorersM, scorersF] = await Promise.all([
        sql<{ code: number; year: number; name: string | null }[]>`SELECT code, year, name FROM core.seasons WHERE year = ${year}`,
        tournamentsWhere(sql, sql`t.season_year = ${year}`),
        sql<{ id: number; slug: string; name: string; role: Role; tournament_id: number; start_date: string | null; end_date: string | null; matches: number }[]>`
          SELECT p.id, p.slug, p.name, p.role, p.tournament_id, p.start_date::text, p.end_date::text, coalesce(m.n, 0)::int AS matches
          FROM core.phases p
          LEFT JOIN (SELECT phase_id, count(*) AS n FROM core.matches WHERE season_year = ${year} GROUP BY phase_id) m ON m.phase_id = p.id
          WHERE p.season_year = ${year} ORDER BY p.tournament_id, p.sort_order`,
        sql<{ category: Category; matches: number; goals: number; attributed: number }[]>`
          SELECT category, sum(matches)::int AS matches, sum(goals_total)::int AS goals, sum(goals_attributed)::int AS attributed
          FROM stats.coverage WHERE season_year = ${year} GROUP BY category`,
        topScorers(sql, sql`pa.season_year = ${year} AND pa.category = 'M'`),
        topScorers(sql, sql`pa.season_year = ${year} AND pa.category = 'F'`),
      ]);
      const season = seasonRows[0];
      if (!season) throw notFound('temporada');
      const teams = await teamsById(sql, tournaments.map((t) => t.champ_team).filter((x): x is number => x !== null));
      const categories = await Promise.all(
        (['M', 'F'] as const)
          .filter((c) => tournaments.some((t) => t.t_cat === c))
          .map(async (category) => {
            const c = cov.find((x) => x.category === category);
            return {
              category,
              matches: c?.matches ?? 0,
              goals: c?.goals ?? 0,
              goalsPerMatch: ratio(c?.goals ?? 0, c?.matches ?? 0),
              attributedShare: c && c.goals > 0 ? round2(c.attributed / c.goals) : null,
              tournaments: tournaments
                .filter((t) => t.t_cat === category)
                .map((t) => ({
                  tournament: toTournamentRef(t),
                  champion: champion(t, teams),
                  startDate: t.start_date,
                  endDate: t.end_date,
                  phases: phases
                    .filter((p) => p.tournament_id === t.t_id)
                    .map((p) => ({
                      phase: { id: p.id, slug: p.slug, name: p.name, role: p.role },
                      startDate: p.start_date,
                      endDate: p.end_date,
                      matches: p.matches,
                    })),
                })),
              topScorers: category === 'M' ? scorersM : scorersF,
            };
          }),
      );
      return { data: { year: season.year, name: season.name, categories }, meta: meta(ctx) };
    },
  );

  app.get('/api/v1/torneos', { schema: { response: { 200: Envelope(Type.Array(TournamentListItem)) } } }, async (req) => {
    const { filters, ignored, from, to } = filtersFrom(ctx, req, ['temporada', 'desde', 'hasta', 'rama', 'tipo']);
    const parts: Fragment[] = [];
    if (from !== undefined) parts.push(sql`t.season_year >= ${from}`);
    if (to !== undefined) parts.push(sql`t.season_year <= ${to}`);
    if (filters.rama) parts.push(sql`t.category = ${filters.rama}`);
    if (filters.tipo) parts.push(sql`t.kind = ${filters.tipo}`);
    const rows = await tournamentsWhere(sql, and(sql, parts));
    const counts = new Map(
      (await sql<{ tournament_id: number; n: number }[]>`
        SELECT tournament_id, count(*)::int AS n FROM core.matches GROUP BY tournament_id`).map((r) => [r.tournament_id, r.n]),
    );
    const teams = await teamsById(sql, rows.map((t) => t.champ_team).filter((x): x is number => x !== null));
    return {
      data: rows.map((t) => ({ tournament: toTournamentRef(t), champion: champion(t, teams), matches: counts.get(t.t_id) ?? 0 })),
      meta: meta(ctx, ignored),
    };
  });

  app.get<{ Params: { id: string } }>(
    '/api/v1/torneos/:id',
    { schema: { response: { 200: Envelope(TournamentDetail) } } },
    async (req) => {
      const id = idParam(req.params.id);
      const [[t], summaryRows, phases, scorers] = await Promise.all([
        tournamentsWhere(sql, sql`t.id = ${id}`),
        sql<{ matches: number; goals: number; yellow: number; red: number; attributed: number; real_matches: number }[]>`
        SELECT (SELECT count(*) FROM core.matches WHERE tournament_id = ${id} AND status = 'jugado')::int AS matches,
               coalesce(sum(goals_total), 0)::int AS goals, coalesce(sum(yellow_cards), 0)::int AS yellow,
               coalesce(sum(red_cards), 0)::int AS red, coalesce(sum(goals_attributed), 0)::int AS attributed,
               coalesce(sum(matches), 0)::int AS real_matches
        FROM stats.coverage WHERE tournament_id = ${id}`,
        sql<{ id: number; slug: string; name: string; role: Role; start_date: string | null; end_date: string | null }[]>`
          SELECT id, slug, name, role, start_date::text, end_date::text FROM core.phases WHERE tournament_id = ${id} ORDER BY sort_order`,
        topScorers(sql, sql`pa.tournament_id = ${id}`),
      ]);
      if (!t) throw notFound('torneo');
      const summary = summaryRows[0];
      const [teams, phaseData] = await Promise.all([
        teamsById(sql, t.champ_team !== null ? [t.champ_team] : []),
        Promise.all(
        phases.map(async (p) => ({
          phase: { id: p.id, slug: p.slug, name: p.name, role: p.role },
          startDate: p.start_date,
          endDate: p.end_date,
          standings: p.role === 'league' ? await phaseStandings(sql, p.id) : null,
          matches: p.role === 'league' ? [] : await matchesWhere(sql, sql`m.phase_id = ${p.id}`),
        })),
        ),
      ]);
      const s = summary!;
      return {
        data: {
          tournament: toTournamentRef(t),
          champion: champion(t, teams),
          summary: {
            matches: s.matches,
            goals: s.goals,
            goalsPerMatch: ratio(s.goals, s.real_matches),
            yellowCards: s.yellow,
            redCards: s.red,
            attributedShare: s.goals > 0 ? round2(s.attributed / s.goals) : null,
          },
          phases: phaseData,
          topScorers: scorers,
        },
        meta: meta(ctx),
      };
    },
  );

  app.get<{ Params: { id: string } }>('/api/v1/fases/:id', { schema: { response: { 200: Envelope(PhaseDetail) } } }, async (req) => {
    const id = idParam(req.params.id);
    const { filters, ignored } = filtersFrom(ctx, req, ['fecha', 'despues']);
    const [phaseRows, rounds, allMatches, computedOrOfficial] = await Promise.all([
      sql<
        { id: number; slug: string; name: string; role: Role; source_serie: string; t_id: number; t_slug: string; t_name: string; t_year: number; t_cat: Category; t_kind: Kind }[]
      >`
        SELECT p.id, p.slug, p.name, p.role, p.source_serie,
               t.id AS t_id, t.slug AS t_slug, t.name AS t_name, t.season_year AS t_year, t.category AS t_cat, t.kind AS t_kind
        FROM core.phases p JOIN core.tournaments t ON t.id = p.tournament_id WHERE p.id = ${id}`,
      sql<{ round: number; start_date: string | null; end_date: string | null; match_count: number }[]>`
        SELECT round, start_date::text, end_date::text, match_count FROM core.rounds WHERE phase_id = ${id} ORDER BY round`,
      matchesWhere(sql, sql`m.phase_id = ${id}`, sql`m.round, m.kickoff NULLS LAST, m.id`),
      phaseStandings(sql, id, filters.despues),
    ]);
    const p = phaseRows[0];
    if (!p) throw notFound('fase');
    const roundNumbers = new Set(rounds.map((r) => r.round));
    const selected = filters.fecha !== undefined && roundNumbers.has(filters.fecha) ? filters.fecha : null;
    if (filters.fecha !== undefined && selected === null) ignored.push(`fecha=${filters.fecha}`);
    const matches = selected !== null ? allMatches.filter((m) => m.round === selected) : allMatches;
    const standings = p.role === 'league' || filters.despues !== undefined ? computedOrOfficial : null;
    const tournament: TournamentRef = toTournamentRef(p);
    return {
      data: {
        phase: { id: p.id, slug: p.slug, name: p.name, role: p.role },
        tournament,
        sourceName: p.source_serie,
        rounds: rounds.map((r) => ({ round: r.round, startDate: r.start_date, endDate: r.end_date, matchCount: r.match_count })),
        selectedRound: selected,
        matches,
        standings,
      },
      meta: meta(ctx, ignored),
    };
  });

  app.get('/api/v1/campeones', { schema: { response: { 200: Envelope(ChampionsData) } } }, async (req) => {
    const { filters, ignored, from, to } = filtersFrom(ctx, req, ['rama', 'tipo', 'desde', 'hasta']);
    const parts: Fragment[] = [sql`t.kind <> 'otro'`];
    if (filters.rama) parts.push(sql`t.category = ${filters.rama}`);
    if (filters.tipo) parts.push(sql`t.kind = ${filters.tipo}`);
    if (from !== undefined) parts.push(sql`t.season_year >= ${from}`);
    if (to !== undefined) parts.push(sql`t.season_year <= ${to}`);
    const rows = await tournamentsWhere(sql, and(sql, parts));
    const teams = await teamsById(sql, rows.map((t) => t.champ_team).filter((x): x is number => x !== null));
    const years = [...new Set(rows.map((r) => r.t_year))].sort((a, b) => b - a);
    const byTeam = new Map<number, TournamentRef[]>();
    for (const r of rows) if (r.champ_team !== null) byTeam.set(r.champ_team, [...(byTeam.get(r.champ_team) ?? []), toTournamentRef(r)]);
    const ranking = [...byTeam.entries()]
      .map(([teamId, list]) => ({ team: teams.get(teamId)!, titles: list.length, tournaments: list, rank: 0 }))
      .sort((a, b) => b.titles - a.titles || a.team.name.localeCompare(b.team.name, 'es'));
    let prev = -1;
    ranking.forEach((r, i) => {
      r.rank = r.titles === prev ? ranking[i - 1]!.rank : i + 1;
      prev = r.titles;
    });
    return {
      data: {
        seasons: years.map((year) => ({
          year,
          titles: rows.filter((r) => r.t_year === year).map((r) => ({ tournament: toTournamentRef(r), champion: champion(r, teams) })),
        })),
        ranking,
      },
      meta: meta(ctx, ignored),
    };
  });
}
