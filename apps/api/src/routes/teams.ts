import {
  Envelope,
  TeamLeaders,
  TeamList,
  TeamMatches,
  TeamOpponents,
  TeamProfile,
  TeamSeasons,
  TeamSquad,
  type Category,
  type Result,
  type Role,
  type Streak,
  type TeamTotals,
} from '@ligapedia/contracts';
import type { Sql } from '@ligapedia/db';
import type { FastifyInstance } from 'fastify';
import { filtersFrom, idParam, meta, type ApiContext } from '../context';
import { notFound } from '../errors';
import {
  and,
  matchesById,
  pct,
  playerRef,
  playersById,
  ratio,
  teamRef,
  teamsById,
  tournamentsById,
  type Fragment,
} from '../queries/common';

const PAGE_SIZE = 50;

interface TeamAggRow {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  gf: number;
  ga: number;
  points: number;
  clean_sheets: number;
  wo_wins: number;
  wo_losses: number;
}

export function toTeamTotals(r: TeamAggRow | undefined): TeamTotals {
  const t = r ?? { played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, points: 0, clean_sheets: 0, wo_wins: 0, wo_losses: 0 };
  return {
    played: t.played,
    wins: t.wins,
    draws: t.draws,
    losses: t.losses,
    winPct: pct(t.wins, t.played),
    pointsPct: pct(t.points, t.played * 3),
    gf: t.gf,
    ga: t.ga,
    gd: t.gf - t.ga,
    gfPerMatch: ratio(t.gf, t.played),
    gaPerMatch: ratio(t.ga, t.played),
    cleanSheets: t.clean_sheets,
    woWins: t.wo_wins,
    woLosses: t.wo_losses,
  };
}

const TEAM_AGG_SUMS = `coalesce(sum(played), 0)::int AS played, coalesce(sum(wins), 0)::int AS wins, coalesce(sum(draws), 0)::int AS draws,
  coalesce(sum(losses), 0)::int AS losses, coalesce(sum(gf), 0)::int AS gf, coalesce(sum(ga), 0)::int AS ga,
  coalesce(sum(points), 0)::int AS points, coalesce(sum(clean_sheets), 0)::int AS clean_sheets,
  coalesce(sum(wo_wins), 0)::int AS wo_wins, coalesce(sum(wo_losses), 0)::int AS wo_losses`;

export async function teamExists(sql: Sql, id: number) {
  if (!Number.isFinite(id)) return undefined;
  const [t] = await sql<{ id: number; slug: string; display_name: string; category: Category }[]>`
    SELECT id, slug, display_name, category FROM core.teams WHERE id = ${id}`;
  return t;
}

export async function teamRoutes(app: FastifyInstance, ctx: ApiContext): Promise<void> {
  const { sql } = ctx;
  const ORDERS = ['partidos', 'victorias', 'titulos', 'nombre', 'porcentaje'] as const;

  app.get('/api/v1/equipos', { schema: { response: { 200: Envelope(TeamList) } } }, async (req) => {
    const { filters, ignored, from, to } = filtersFrom(ctx, req, ['temporada', 'desde', 'hasta', 'rama', 'orden', 'pagina'], ORDERS);
    const parts: Fragment[] = [];
    if (from !== undefined) parts.push(sql`ta.season_year >= ${from}`);
    if (to !== undefined) parts.push(sql`ta.season_year <= ${to}`);
    if (filters.rama) parts.push(sql`ta.category = ${filters.rama}`);
    const where = and(sql, parts);
    const order =
      filters.orden === 'nombre'
        ? sql`t.display_name ASC`
        : filters.orden === 'victorias'
          ? sql`wins DESC, played DESC`
          : filters.orden === 'titulos'
            ? sql`titles DESC, played DESC`
            : filters.orden === 'porcentaje'
              ? sql`(wins::float / nullif(played, 0)) DESC NULLS LAST, played DESC`
              : sql`played DESC, t.display_name`;
    const page = filters.pagina ?? 1;
    const rows = await sql<{ id: number; slug: string; name: string; category: Category; played: number; wins: number; y0: number; y1: number; titles: number; total: number }[]>`
      SELECT t.id, t.slug, t.display_name AS name, t.category, sum(ta.played)::int AS played, sum(ta.wins)::int AS wins,
             min(ta.season_year) AS y0, max(ta.season_year) AS y1,
             (SELECT count(*) FROM stats.champions c JOIN core.tournaments tt ON tt.id = c.tournament_id
              WHERE c.team_id = t.id AND tt.kind <> 'otro'
                ${from !== undefined ? sql`AND c.season_year >= ${from}` : sql``}
                ${to !== undefined ? sql`AND c.season_year <= ${to}` : sql``})::int AS titles,
             count(*) OVER ()::int AS total
      FROM stats.team_agg ta JOIN core.teams t ON t.id = ta.team_id
      WHERE ${where}
      GROUP BY t.id, t.slug, t.display_name, t.category
      ORDER BY ${order}
      LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`;
    return {
      data: {
        items: rows.map((r) => ({
          team: teamRef(r.id, r.slug, r.name, r.category),
          firstYear: r.y0,
          lastYear: r.y1,
          played: r.played,
          winPct: pct(r.wins, r.played),
          titles: r.titles,
        })),
        total: rows[0]?.total ?? 0,
        page,
        pageSize: PAGE_SIZE,
      },
      meta: meta(ctx, ignored),
    };
  });

  app.get<{ Params: { id: string } }>('/api/v1/equipos/:id', { schema: { response: { 200: Envelope(TeamProfile) } } }, async (req) => {
    const id = idParam(req.params.id);
    const team = await teamExists(sql, id);
    if (!team) throw notFound('equipo');
    const [names, [agg], seasons, titles, edgeRows, form, streaks] = await Promise.all([
      sql<{ name: string }[]>`
        SELECT n.name FROM core.team_names n JOIN core.teams t ON t.id = n.team_id
        WHERE n.team_id = ${id}
          AND upper(public.f_unaccent(regexp_replace(btrim(n.name), '\s+', ' ', 'g')))
           <> upper(public.f_unaccent(regexp_replace(btrim(t.name), '\s+', ' ', 'g')))
        ORDER BY n.name`,
      sql.unsafe<TeamAggRow[]>(`SELECT ${TEAM_AGG_SUMS} FROM stats.team_agg WHERE team_id = $1`, [id]),
      sql<{ y: number }[]>`SELECT DISTINCT season_year AS y FROM stats.team_agg WHERE team_id = ${id} ORDER BY 1 DESC`,
      sql<{ tournament_id: number }[]>`
        SELECT c.tournament_id FROM stats.champions c JOIN core.tournaments t ON t.id = c.tournament_id
        WHERE c.team_id = ${id} AND t.kind <> 'otro' ORDER BY t.season_year DESC, t.sort_order`,
      sql<{ first_id: number | null; last_id: number | null; big_win: number | null; big_loss: number | null; highest: number | null }[]>`
        SELECT (SELECT match_id FROM stats.team_match WHERE team_id = ${id} ORDER BY kickoff_order LIMIT 1) AS first_id,
               (SELECT match_id FROM stats.team_match WHERE team_id = ${id} ORDER BY kickoff_order DESC LIMIT 1) AS last_id,
               (SELECT match_id FROM stats.team_match WHERE team_id = ${id} AND NOT walk_over AND result = 'G'
                ORDER BY gf - ga DESC, gf DESC, kickoff_order DESC LIMIT 1) AS big_win,
               (SELECT match_id FROM stats.team_match WHERE team_id = ${id} AND NOT walk_over AND result = 'P'
                ORDER BY ga - gf DESC, ga DESC, kickoff_order DESC LIMIT 1) AS big_loss,
               (SELECT match_id FROM stats.team_match WHERE team_id = ${id} AND NOT walk_over
                ORDER BY gf + ga DESC, kickoff_order DESC LIMIT 1) AS highest`,
      sql<{ match_id: number; result: Result }[]>`
        SELECT match_id, result FROM stats.team_match WHERE team_id = ${id} ORDER BY kickoff_order DESC LIMIT 5`,
      sql<{ kind: Streak['kind']; which: 'longest' | 'current'; length: number; start_date: Date | null; end_date: Date | null }[]>`
        SELECT kind, which, length, start_date, end_date FROM stats.streaks WHERE team_id = ${id}`,
    ]);
    const e = edgeRows[0];
    const bigWin = e?.big_win ?? null;
    const bigLoss = e?.big_loss ?? null;
    const highest = e?.highest ?? null;
    const ids = [e?.first_id, e?.last_id, bigWin, bigLoss, highest, ...form.map((f) => f.match_id)].filter((x): x is number => typeof x === 'number');
    const [matches, tournaments] = await Promise.all([matchesById(sql, ids), tournamentsById(sql, titles.map((t) => t.tournament_id))]);
    const toStreak = (s: (typeof streaks)[number]): Streak => ({
      kind: s.kind,
      length: s.length,
      startDate: s.start_date?.toISOString() ?? null,
      endDate: s.end_date?.toISOString() ?? null,
    });
    const last = form[0]?.result;
    const currentKind: Streak['kind'] | null = last === 'G' ? 'win' : last === 'P' ? 'loss' : last === 'E' ? 'unbeaten' : null;
    const current = streaks.find((s) => s.which === 'current' && s.kind === currentKind);
    const order: Streak['kind'][] = ['win', 'unbeaten', 'loss', 'winless'];
    return {
      data: {
        team: teamRef(team.id, team.slug, team.display_name, team.category),
        otherNames: names.map((n) => n.name),
        totals: toTeamTotals(agg),
        seasons: seasons.map((s) => s.y),
        titles: titles.map((t) => tournaments.get(t.tournament_id)!),
        firstMatch: e?.first_id ? (matches.get(e.first_id) ?? null) : null,
        lastMatch: e?.last_id ? (matches.get(e.last_id) ?? null) : null,
        form: form.map((f) => ({ result: f.result, match: matches.get(f.match_id)! })),
        currentStreak: current ? toStreak(current) : null,
        longestStreaks: order
          .map((k) => streaks.find((s) => s.which === 'longest' && s.kind === k))
          .filter((s): s is (typeof streaks)[number] => Boolean(s))
          .map(toStreak),
        biggestWin: bigWin ? (matches.get(bigWin) ?? null) : null,
        biggestLoss: bigLoss ? (matches.get(bigLoss) ?? null) : null,
        highestScoring: highest ? (matches.get(highest) ?? null) : null,
      },
      meta: meta(ctx),
    };
  });

  app.get<{ Params: { id: string } }>('/api/v1/equipos/:id/temporadas', { schema: { response: { 200: Envelope(TeamSeasons) } } }, async (req) => {
    const id = idParam(req.params.id);
    if (!(await teamExists(sql, id))) throw notFound('equipo');
    const [aggs, positions, scorers] = await Promise.all([
      sql<(TeamAggRow & { season_year: number; category: Category; tournament_ids: number[] })[]>`
        SELECT season_year, min(category) AS category, array_agg(tournament_id ORDER BY tournament_id) AS tournament_ids,
               sum(played)::int AS played, sum(wins)::int AS wins, sum(draws)::int AS draws, sum(losses)::int AS losses,
               sum(gf)::int AS gf, sum(ga)::int AS ga, sum(points)::int AS points, 0 AS clean_sheets, 0 AS wo_wins, 0 AS wo_losses
        FROM stats.team_agg WHERE team_id = ${id} GROUP BY season_year ORDER BY season_year DESC`,
      sql<{ season_year: number; phase_id: number; slug: string; name: string; role: Role; tournament_id: number; position: number; teams: number }[]>`
        WITH official AS (
          SELECT s.phase_id, s.position, (SELECT count(*) FROM core.standings_official x WHERE x.phase_id = s.phase_id)::int AS teams
          FROM core.standings_official s WHERE s.team_id = ${id}
        ), computed AS (
          SELECT s.phase_id, s.position, (SELECT count(*) FROM stats.standings_by_round x WHERE x.phase_id = s.phase_id AND x.after_round = s.after_round)::int AS teams
          FROM stats.standings_by_round s
          WHERE s.team_id = ${id}
            AND s.after_round = (SELECT max(after_round) FROM stats.standings_by_round y WHERE y.phase_id = s.phase_id)
            AND NOT EXISTS (SELECT 1 FROM core.standings_official o WHERE o.phase_id = s.phase_id)
        )
        SELECT p.season_year, p.id AS phase_id, p.slug, p.name, p.role, p.tournament_id, x.position, x.teams
        FROM (SELECT * FROM official UNION ALL SELECT * FROM computed) x
        JOIN core.phases p ON p.id = x.phase_id
        WHERE p.role = 'league'
        ORDER BY p.season_year DESC, p.sort_order`,
      sql<{ season_year: number; player_id: number; goals: number }[]>`
        SELECT DISTINCT ON (season_year) season_year, player_id, goals FROM (
          SELECT season_year, player_id, sum(goals)::int AS goals FROM stats.player_agg WHERE team_id = ${id} GROUP BY 1, 2
        ) x WHERE goals > 0 ORDER BY season_year, goals DESC, player_id`,
    ]);
    const tournaments = await tournamentsById(sql, [...new Set([...aggs.flatMap((a) => a.tournament_ids), ...positions.map((p) => p.tournament_id)])]);
    const players = await playersById(sql, scorers.map((s) => s.player_id));
    return {
      data: {
        rows: aggs.map((a) => {
          const s = scorers.find((x) => x.season_year === a.season_year);
          return {
            seasonYear: a.season_year,
            category: a.category,
            tournaments: a.tournament_ids.map((t) => tournaments.get(t)!),
            positions: positions
              .filter((p) => p.season_year === a.season_year)
              .map((p) => ({
                phase: { id: p.phase_id, slug: p.slug, name: p.name, role: p.role },
                tournament: tournaments.get(p.tournament_id)!,
                position: p.position,
                teams: p.teams,
              })),
            played: a.played,
            wins: a.wins,
            draws: a.draws,
            losses: a.losses,
            gf: a.gf,
            ga: a.ga,
            topScorer: s ? { player: players.get(s.player_id)!, goals: s.goals } : null,
          };
        }),
      },
      meta: meta(ctx),
    };
  });

  app.get<{ Params: { id: string } }>('/api/v1/equipos/:id/plantel', { schema: { response: { 200: Envelope(TeamSquad) } } }, async (req) => {
    const id = idParam(req.params.id);
    if (!(await teamExists(sql, id))) throw notFound('equipo');
    const { filters, ignored } = filtersFrom(ctx, req, ['temporada']);
    const seasons = (await sql<{ y: number }[]>`SELECT DISTINCT season_year AS y FROM stats.player_agg WHERE team_id = ${id} ORDER BY 1 DESC`).map((r) => r.y);
    let year = filters.temporada ?? seasons[0] ?? null;
    if (year !== null && !seasons.includes(year)) {
      ignored.push(`temporada=${year}`);
      year = seasons[0] ?? null;
    }
    const rows =
      year === null
        ? []
        : await sql<{ player_id: number; slug: string; name: string; apps: number; goals: number; yellow: number; red: number; captain: number }[]>`
            SELECT pa.player_id, p.slug, p.display_name AS name, sum(apps)::int AS apps, sum(goals)::int AS goals,
                   sum(yellow)::int AS yellow, sum(red)::int AS red, sum(captain)::int AS captain
            FROM stats.player_agg pa JOIN core.players p ON p.id = pa.player_id
            WHERE pa.team_id = ${id} AND pa.season_year = ${year}
            GROUP BY pa.player_id, p.slug, p.display_name ORDER BY apps DESC, goals DESC, name`;
    return {
      data: {
        seasonYear: year,
        seasons,
        rows: rows.map((r) => ({ player: playerRef(r.player_id, r.slug, r.name), apps: r.apps, goals: r.goals, yellow: r.yellow, red: r.red, captain: r.captain })),
      },
      meta: meta(ctx, ignored),
    };
  });

  app.get<{ Params: { id: string } }>('/api/v1/equipos/:id/lideres', { schema: { response: { 200: Envelope(TeamLeaders) } } }, async (req) => {
    const id = idParam(req.params.id);
    if (!(await teamExists(sql, id))) throw notFound('equipo');
    const rows = await sql<{ player_id: number; slug: string; name: string; apps: number; goals: number; yellow: number; red: number; captain: number }[]>`
      SELECT pa.player_id, p.slug, p.display_name AS name, sum(apps)::int AS apps, sum(goals)::int AS goals,
             sum(yellow)::int AS yellow, sum(red)::int AS red, sum(captain)::int AS captain
      FROM stats.player_agg pa JOIN core.players p ON p.id = pa.player_id
      WHERE pa.team_id = ${id} GROUP BY pa.player_id, p.slug, p.display_name`;
    const top = (key: 'goals' | 'apps' | 'red' | 'yellow' | 'captain') =>
      rows
        .filter((r) => r[key] > 0)
        .sort((a, b) => b[key] - a[key] || a.apps - b.apps || a.name.localeCompare(b.name, 'es'))
        .slice(0, 10)
        .map((r) => ({ player: playerRef(r.player_id, r.slug, r.name), value: r[key], apps: r.apps }));
    return { data: { goals: top('goals'), apps: top('apps'), red: top('red'), yellow: top('yellow'), captain: top('captain') }, meta: meta(ctx) };
  });

  app.get<{ Params: { id: string } }>('/api/v1/equipos/:id/rivales', { schema: { response: { 200: Envelope(TeamOpponents) } } }, async (req) => {
    const id = idParam(req.params.id);
    if (!(await teamExists(sql, id))) throw notFound('equipo');
    const { filters, ignored, from, to } = filtersFrom(ctx, req, ['temporada', 'desde', 'hasta', 'torneo', 'tipo']);
    const parts: Fragment[] = [sql`o.team_id = ${id}`];
    if (from !== undefined) parts.push(sql`o.season_year >= ${from}`);
    if (to !== undefined) parts.push(sql`o.season_year <= ${to}`);
    if (filters.torneo) parts.push(sql`o.tournament_id = ${filters.torneo}`);
    if (filters.tipo) parts.push(sql`o.tournament_kind = ${filters.tipo}`);
    const rows = await sql<{ opponent_id: number; played: number; wins: number; draws: number; losses: number; gf: number; ga: number }[]>`
      SELECT opponent_id, sum(played)::int AS played, sum(wins)::int AS wins, sum(draws)::int AS draws,
             sum(losses)::int AS losses, sum(gf)::int AS gf, sum(ga)::int AS ga
      FROM stats.team_opponent_agg o WHERE ${and(sql, parts)}
      GROUP BY opponent_id ORDER BY played DESC, wins DESC`;
    const teams = await teamsById(sql, rows.map((r) => r.opponent_id));
    return {
      data: {
        rows: rows.map((r) => ({
          opponent: teams.get(r.opponent_id)!,
          played: r.played,
          wins: r.wins,
          draws: r.draws,
          losses: r.losses,
          gf: r.gf,
          ga: r.ga,
          gd: r.gf - r.ga,
          winPct: pct(r.wins, r.played),
        })),
        totalPlayed: rows.reduce((n, r) => n + r.played, 0),
      },
      meta: meta(ctx, ignored),
    };
  });

  app.get<{ Params: { id: string } }>('/api/v1/equipos/:id/partidos', { schema: { response: { 200: Envelope(TeamMatches) } } }, async (req) => {
    const id = idParam(req.params.id);
    if (!(await teamExists(sql, id))) throw notFound('equipo');
    const { filters, ignored, from, to } = filtersFrom(ctx, req, ['temporada', 'desde', 'hasta', 'torneo', 'tipo', 'rival']);
    const parts: Fragment[] = [sql`tm.team_id = ${id}`];
    if (from !== undefined) parts.push(sql`tm.season_year >= ${from}`);
    if (to !== undefined) parts.push(sql`tm.season_year <= ${to}`);
    if (filters.torneo) parts.push(sql`tm.tournament_id = ${filters.torneo}`);
    if (filters.tipo) parts.push(sql`tm.tournament_kind = ${filters.tipo}`);
    if (filters.rival) parts.push(sql`tm.opponent_id = ${filters.rival}`);
    const rows = await sql<{ match_id: number; result: Result; gf: number; ga: number }[]>`
      SELECT match_id, result, gf, ga FROM stats.team_match tm WHERE ${and(sql, parts)} ORDER BY kickoff_order DESC`;
    const matches = await matchesById(sql, rows.map((r) => r.match_id));
    return {
      data: { rows: rows.map((r) => ({ match: matches.get(r.match_id)!, result: r.result, gf: r.gf, ga: r.ga })), total: rows.length },
      meta: meta(ctx, ignored),
    };
  });
}
