import {
  Envelope,
  MATCH_RECORDS,
  MatchRecords,
  PLAYER_METRICS,
  PlayerLeaderboard,
  SeasonTopScorers,
  SingleRecords,
  TEAM_METRICS,
  TeamLeaderboard,
  type Category,
  type MatchRecordType,
  type PlayerMetric,
  type TeamMetric,
  type TournamentRef,
} from '@ligapedia/contracts';
import type { FastifyInstance } from 'fastify';
import { filtersFrom, meta, type ApiContext } from '../context';
import { NotFoundError } from '../errors';
import type { ParsedFilters } from '../filters';
import {
  and,
  coverageFor,
  matchesById,
  playerRef,
  playersById,
  round2,
  teamRef,
  teamsById,
  tournamentsById,
  type Fragment,
} from '../queries/common';
import type { Sql } from '@ligapedia/db';

export const PLAYER_RATIO_DEFAULT_MIN = 10;
export const TEAM_RATIO_DEFAULT_MIN = 20;

/** Scope conditions shared by aggregate tables with season_year/category/tournament columns. */
function scope(sql: Sql, alias: string, p: ParsedFilters, withTeam: string | null = null): Fragment[] {
  const a = sql(alias);
  const parts: Fragment[] = [];
  if (p.from !== undefined) parts.push(sql`${a}.season_year >= ${p.from}`);
  if (p.to !== undefined) parts.push(sql`${a}.season_year <= ${p.to}`);
  if (p.filters.rama) parts.push(sql`${a}.category = ${p.filters.rama}`);
  if (p.filters.torneo) parts.push(sql`${a}.tournament_id = ${p.filters.torneo}`);
  if (p.filters.tipo) parts.push(sql`${a}.tournament_kind = ${p.filters.tipo}`);
  if (withTeam && p.filters.equipo) parts.push(sql`${a}.${sql(withTeam)} = ${p.filters.equipo}`);
  return parts;
}

/** Assign shared ranks for equal values (rows already ordered). */
function ranked<T extends { value: number }>(rows: T[]): Array<T & { rank: number }> {
  let rank = 0;
  let prev: number | null = null;
  return rows.map((r, i) => {
    if (prev === null || r.value !== prev) rank = i + 1;
    prev = r.value;
    return { ...r, rank };
  });
}

export async function recordRoutes(app: FastifyInstance, ctx: ApiContext): Promise<void> {
  const { sql } = ctx;
  const FILTERS = ['temporada', 'desde', 'hasta', 'rama', 'torneo', 'tipo', 'equipo', 'top', 'min'] as const;

  app.get<{ Params: { metric: string } }>(
    '/api/v1/records/jugadores/:metric',
    { schema: { response: { 200: Envelope(PlayerLeaderboard) } } },
    async (req) => {
      const metric = req.params.metric as PlayerMetric;
      if (!(PLAYER_METRICS as readonly string[]).includes(metric)) throw new NotFoundError('Récord no encontrado');
      const p = filtersFrom(ctx, req, FILTERS);
      const top = p.filters.top ?? 10;
      const isRatio = metric === 'goles-por-partido' || metric === 'tarjetas-por-partido';
      const min = isRatio ? (p.filters.min ?? PLAYER_RATIO_DEFAULT_MIN) : null;
      const where = and(sql, scope(sql, 'pa', p, 'team_id'));
      const expr: Record<PlayerMetric, Fragment> = {
        goles: sql`sum(pa.goals)`,
        'goles-por-partido': sql`sum(pa.goals)::float / sum(pa.apps)`,
        partidos: sql`sum(pa.apps)`,
        amarillas: sql`sum(pa.yellow)`,
        rojas: sql`sum(pa.red)`,
        tarjetas: sql`sum(pa.yellow + pa.red)`,
        'tarjetas-por-partido': sql`sum(pa.yellow + pa.red)::float / sum(pa.apps)`,
        'goles-en-contra': sql`sum(pa.own_goals)`,
        capitan: sql`sum(pa.captain)`,
        tripletes: sql`sum(pa.hat_tricks)`,
        temporadas: sql`count(DISTINCT pa.season_year)`,
        titulos: sql`count(DISTINCT c.tournament_id)`,
      };
      const championJoin =
        metric === 'titulos' ? sql`LEFT JOIN stats.champions c ON c.tournament_id = pa.tournament_id AND c.team_id = pa.team_id` : sql``;
      const rows = await sql<{ player_id: number; slug: string; name: string; value: number; apps: number; team_ids: number[] }[]>`
        SELECT pa.player_id, p.slug, p.display_name AS name, (${expr[metric]})::float AS value, sum(pa.apps)::int AS apps,
               array_agg(pa.team_id ORDER BY pa.apps DESC) AS team_ids
        FROM stats.player_agg pa JOIN core.players p ON p.id = pa.player_id ${championJoin}
        WHERE ${where}
        GROUP BY pa.player_id, p.slug, p.display_name
        HAVING (${expr[metric]}) > 0 ${min !== null ? sql`AND sum(pa.apps) >= ${min}` : sql``}
        ORDER BY value DESC, apps ASC, name ASC
        LIMIT ${top}`;
      const teams = await teamsById(sql, [...new Set(rows.flatMap((r) => r.team_ids))]);
      const coverage = await coverageFor(sql, and(sql, scope(sql, 'coverage', p)));
      return {
        data: {
          metric,
          isRatio,
          minMatches: min,
          top,
          rows: ranked(
            rows.map((r) => ({
              player: playerRef(r.player_id, r.slug, r.name),
              teams: [...new Set(r.team_ids)].slice(0, 2).map((t) => teams.get(t)!),
              value: isRatio ? round2(r.value)! : r.value,
              apps: r.apps,
            })),
          ),
          coverage,
        },
        meta: meta(ctx, p.ignored),
      };
    },
  );

  app.get<{ Params: { metric: string } }>(
    '/api/v1/records/equipos/:metric',
    { schema: { response: { 200: Envelope(TeamLeaderboard) } } },
    async (req) => {
      const metric = req.params.metric as TeamMetric;
      if (!(TEAM_METRICS as readonly string[]).includes(metric)) throw new NotFoundError('Récord no encontrado');
      const p = filtersFrom(ctx, req, ['temporada', 'desde', 'hasta', 'rama', 'torneo', 'tipo', 'top', 'min']);
      const top = p.filters.top ?? 10;
      const isRatio = ['porcentaje-victorias', 'porcentaje-puntos', 'goles-recibidos-por-partido'].includes(metric);
      const min = isRatio ? (p.filters.min ?? TEAM_RATIO_DEFAULT_MIN) : null;
      let rows: Array<{ team_id: number; value: number; played: number; detail: number[] }>;

      if (metric === 'titulos') {
        const parts: Fragment[] = [sql`c.team_id IS NOT NULL`, sql`t.kind <> 'otro'`];
        if (p.from !== undefined) parts.push(sql`t.season_year >= ${p.from}`);
        if (p.to !== undefined) parts.push(sql`t.season_year <= ${p.to}`);
        if (p.filters.rama) parts.push(sql`t.category = ${p.filters.rama}`);
        if (p.filters.torneo) parts.push(sql`t.id = ${p.filters.torneo}`);
        if (p.filters.tipo) parts.push(sql`t.kind = ${p.filters.tipo}`);
        rows = await sql<typeof rows>`
          SELECT c.team_id, count(*)::float AS value,
                 (SELECT coalesce(sum(played), 0) FROM stats.team_agg ta WHERE ta.team_id = c.team_id)::int AS played,
                 array_agg(c.tournament_id ORDER BY t.season_year DESC) AS detail
          FROM stats.champions c JOIN core.tournaments t ON t.id = c.tournament_id
          WHERE ${and(sql, parts)} GROUP BY c.team_id ORDER BY value DESC, played ASC LIMIT ${top}`;
      } else if (metric === 'racha-victorias' || metric === 'racha-invicto') {
        const results = metric === 'racha-victorias' ? ['G'] : ['G', 'E'];
        rows = await sql<typeof rows>`
          WITH tm AS (
            SELECT team_id, kickoff_order, result,
                   row_number() OVER (PARTITION BY team_id ORDER BY kickoff_order) AS rn
            FROM stats.team_match tm WHERE ${and(sql, scope(sql, 'tm', p))}
          ), flagged AS (
            SELECT team_id, rn - row_number() OVER (PARTITION BY team_id ORDER BY kickoff_order) AS grp
            FROM tm WHERE result = ANY(${sql.array(results)}::char[])
          ), islands AS (
            SELECT team_id, count(*) AS len FROM flagged GROUP BY team_id, grp
          )
          SELECT i.team_id, max(i.len)::float AS value,
                 (SELECT count(*) FROM tm WHERE tm.team_id = i.team_id)::int AS played, '{}'::int[] AS detail
          FROM islands i GROUP BY i.team_id ORDER BY value DESC, played ASC LIMIT ${top}`;
      } else {
        const expr: Record<string, Fragment> = {
          victorias: sql`sum(ta.wins)`,
          partidos: sql`sum(ta.played)`,
          'porcentaje-victorias': sql`100.0 * sum(ta.wins) / sum(ta.played)`,
          'porcentaje-puntos': sql`100.0 * sum(ta.points) / (3 * sum(ta.played))`,
          goles: sql`sum(ta.gf)`,
          'goles-recibidos-por-partido': sql`sum(ta.ga)::float / sum(ta.played)`,
          'vallas-invictas': sql`sum(ta.clean_sheets)`,
        };
        const ascending = metric === 'goles-recibidos-por-partido';
        rows = await sql<typeof rows>`
          SELECT ta.team_id, (${expr[metric]!})::float AS value, sum(ta.played)::int AS played, '{}'::int[] AS detail
          FROM stats.team_agg ta WHERE ${and(sql, scope(sql, 'ta', p))}
          GROUP BY ta.team_id
          HAVING sum(ta.played) > 0 ${min !== null ? sql`AND sum(ta.played) >= ${min}` : sql``}
            ${ascending ? sql`` : sql`AND (${expr[metric]!}) > 0`}
          ORDER BY value ${ascending ? sql`ASC` : sql`DESC`}, played DESC LIMIT ${top}`;
      }
      const [teams, tournaments] = await Promise.all([
        teamsById(sql, rows.map((r) => r.team_id)),
        tournamentsById(sql, rows.flatMap((r) => r.detail)),
      ]);
      return {
        data: {
          metric,
          isRatio,
          minMatches: min,
          top,
          rows: ranked(
            rows.map((r) => ({
              team: teams.get(r.team_id)!,
              value: isRatio ? Math.round(r.value * 10) / 10 : r.value,
              played: r.played,
              detail: r.detail.map((t) => tournaments.get(t)).filter((t): t is TournamentRef => Boolean(t)),
            })),
          ),
        },
        meta: meta(ctx, p.ignored),
      };
    },
  );

  app.get<{ Params: { type: string } }>(
    '/api/v1/records/partidos/:type',
    { schema: { response: { 200: Envelope(MatchRecords) } } },
    async (req) => {
      const type = req.params.type as MatchRecordType;
      if (!(MATCH_RECORDS as readonly string[]).includes(type)) throw new NotFoundError('Récord no encontrado');
      const p = filtersFrom(ctx, req, ['temporada', 'desde', 'hasta', 'rama', 'torneo', 'tipo', 'top']);
      const top = p.filters.top ?? 10;
      const parts = scope(sql, 'r', p);
      const rows =
        type === 'goleadas'
          ? await sql<{ match_id: number; value: number }[]>`
              SELECT match_id, goal_diff AS value FROM stats.records_match r WHERE ${and(sql, [...parts, sql`goal_diff > 0`])}
              ORDER BY goal_diff DESC, winner_goals DESC, kickoff_order DESC LIMIT ${top}`
          : await sql<{ match_id: number; value: number }[]>`
              SELECT match_id, total_goals AS value FROM stats.records_match r
              WHERE ${and(sql, type === 'empates-con-mas-goles' ? [...parts, sql`is_draw`] : parts)}
              ORDER BY total_goals DESC, kickoff_order DESC LIMIT ${top}`;
      const matches = await matchesById(sql, rows.map((r) => r.match_id));
      return {
        data: { type, top, rows: ranked(rows.map((r) => ({ match: matches.get(r.match_id)!, value: r.value }))) },
        meta: meta(ctx, p.ignored),
      };
    },
  );

  app.get('/api/v1/records/hitos', { schema: { response: { 200: Envelope(SingleRecords) } } }, async (req) => {
    const p = filtersFrom(ctx, req, ['temporada', 'desde', 'hasta', 'rama', 'torneo', 'tipo']);
    const [inMatch, inSeason, inTournament, reds, coverage] = await Promise.all([
      sql<{ player_id: number; team_id: number; goals: number; match_id: number }[]>`
        SELECT player_id, team_id, goals, match_id FROM stats.player_match pm
        WHERE ${and(sql, [...scope(sql, 'pm', p), sql`goals > 0`])}
        ORDER BY goals DESC, kickoff_order ASC LIMIT 10`,
      sql<{ player_id: number; season_year: number; category: Category; goals: number }[]>`
        SELECT player_id, season_year, min(category) AS category, sum(goals)::int AS goals FROM stats.player_agg pa
        WHERE ${and(sql, scope(sql, 'pa', p))} GROUP BY player_id, season_year
        HAVING sum(goals) > 0 ORDER BY goals DESC, season_year LIMIT 10`,
      sql<{ player_id: number; tournament_id: number; goals: number }[]>`
        SELECT player_id, tournament_id, sum(goals)::int AS goals FROM stats.player_agg pa
        WHERE ${and(sql, scope(sql, 'pa', p))} GROUP BY player_id, tournament_id
        HAVING sum(goals) > 0 ORDER BY goals DESC LIMIT 10`,
      sql<{ match_id: number; red_cards: number }[]>`
        SELECT match_id, red_cards FROM stats.records_match r WHERE ${and(sql, [...scope(sql, 'r', p), sql`red_cards > 0`])}
        ORDER BY red_cards DESC, kickoff_order DESC LIMIT 10`,
      coverageFor(sql, and(sql, scope(sql, 'coverage', p))),
    ]);
    const [players, teams, matches, tournaments] = await Promise.all([
      playersById(sql, [...new Set([...inMatch, ...inSeason, ...inTournament].map((r) => r.player_id))]),
      teamsById(sql, inMatch.map((r) => r.team_id)),
      matchesById(sql, [...inMatch.map((r) => r.match_id), ...reds.map((r) => r.match_id)]),
      tournamentsById(sql, inTournament.map((r) => r.tournament_id)),
    ]);
    return {
      data: {
        mostGoalsInMatch: inMatch.map((r) => ({ player: players.get(r.player_id)!, team: teams.get(r.team_id)!, goals: r.goals, match: matches.get(r.match_id)! })),
        mostGoalsInSeason: inSeason.map((r) => ({ player: players.get(r.player_id)!, seasonYear: r.season_year, category: r.category, goals: r.goals })),
        mostGoalsInTournament: inTournament.map((r) => ({ player: players.get(r.player_id)!, tournament: tournaments.get(r.tournament_id)!, goals: r.goals })),
        mostRedCardsInMatch: reds.map((r) => ({ match: matches.get(r.match_id)!, redCards: r.red_cards })),
        coverage,
      },
      meta: meta(ctx, p.ignored),
    };
  });

  app.get('/api/v1/records/goleadores-por-temporada', { schema: { response: { 200: Envelope(SeasonTopScorers) } } }, async (req) => {
    const p = filtersFrom(ctx, req, ['rama', 'desde', 'hasta']);
    const parts: Fragment[] = [sql`s.rank = 1`];
    if (p.filters.rama) parts.push(sql`s.category = ${p.filters.rama}`);
    if (p.from !== undefined) parts.push(sql`s.season_year >= ${p.from}`);
    if (p.to !== undefined) parts.push(sql`s.season_year <= ${p.to}`);
    const rows = await sql<{ season_year: number; category: Category; player_id: number; slug: string; name: string; goals: number; team_ids: number[] }[]>`
      SELECT s.season_year, s.category, s.player_id, p.slug, p.display_name AS name, s.goals,
             (SELECT array_agg(DISTINCT team_id) FROM stats.player_agg pa
              WHERE pa.player_id = s.player_id AND pa.season_year = s.season_year AND pa.category = s.category) AS team_ids
      FROM stats.season_top_scorers s JOIN core.players p ON p.id = s.player_id
      WHERE ${and(sql, parts)} ORDER BY s.season_year DESC, s.category DESC, p.display_name`;
    const cov = await sql<{ season_year: number; category: Category; total: number; attributed: number }[]>`
      SELECT season_year, category, sum(goals_total)::int AS total, sum(goals_attributed)::int AS attributed
      FROM stats.coverage GROUP BY season_year, category`;
    const teams = await teamsById(sql, [...new Set(rows.flatMap((r) => r.team_ids ?? []))]);
    const groups = new Map<string, { seasonYear: number; category: Category; scorers: Array<{ player: ReturnType<typeof playerRef>; teams: ReturnType<typeof teamRef>[]; goals: number }> }>();
    for (const r of rows) {
      const key = `${r.season_year}|${r.category}`;
      const g = groups.get(key) ?? { seasonYear: r.season_year, category: r.category, scorers: [] };
      g.scorers.push({ player: playerRef(r.player_id, r.slug, r.name), teams: (r.team_ids ?? []).map((t) => teams.get(t)!), goals: r.goals });
      groups.set(key, g);
    }
    return {
      data: {
        seasons: [...groups.values()].map((g) => {
          const c = cov.find((x) => x.season_year === g.seasonYear && x.category === g.category);
          return { ...g, attributedShare: c && c.total > 0 ? round2(c.attributed / c.total) : null };
        }),
      },
      meta: meta(ctx, p.ignored),
    };
  });
}
