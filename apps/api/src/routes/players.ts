import {
  Envelope,
  PlayerList,
  PlayerMatches,
  PlayerMilestones,
  PlayerOpponents,
  PlayerProfile,
  PlayerSeasons,
  type Category,
  type PlayerTotals,
  type Result,
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
  ratio,
  round2,
  teamsById,
  tournamentsById,
  type Fragment,
} from '../queries/common';

const PAGE_SIZE = 50;

interface TotalsRow {
  apps: number;
  goals: number;
  own_goals: number;
  yellow: number;
  red: number;
  captain: number;
  wins: number;
  draws: number;
  losses: number;
  hat_tricks: number;
}

export function toTotals(r: TotalsRow | undefined): PlayerTotals {
  const t = r ?? { apps: 0, goals: 0, own_goals: 0, yellow: 0, red: 0, captain: 0, wins: 0, draws: 0, losses: 0, hat_tricks: 0 };
  return {
    apps: t.apps,
    goals: t.goals,
    goalsPerMatch: ratio(t.goals, t.apps),
    ownGoals: t.own_goals,
    yellow: t.yellow,
    red: t.red,
    cardsPerMatch: ratio(t.yellow + t.red, t.apps),
    captain: t.captain,
    wins: t.wins,
    draws: t.draws,
    losses: t.losses,
    winPct: pct(t.wins, t.apps),
    hatTricks: t.hat_tricks,
  };
}

export async function playerTotals(sql: Sql, where: Fragment): Promise<PlayerTotals> {
  const [row] = await sql<TotalsRow[]>`
    SELECT coalesce(sum(apps), 0)::int AS apps, coalesce(sum(goals), 0)::int AS goals, coalesce(sum(own_goals), 0)::int AS own_goals,
           coalesce(sum(yellow), 0)::int AS yellow, coalesce(sum(red), 0)::int AS red, coalesce(sum(captain), 0)::int AS captain,
           coalesce(sum(wins), 0)::int AS wins, coalesce(sum(draws), 0)::int AS draws, coalesce(sum(losses), 0)::int AS losses,
           coalesce(sum(hat_tricks), 0)::int AS hat_tricks
    FROM stats.player_agg pa WHERE ${where}`;
  return toTotals(row);
}

export async function playerExists(sql: Sql, id: number): Promise<{ id: number; slug: string; display_name: string } | undefined> {
  if (!Number.isFinite(id)) return undefined;
  const [p] = await sql<{ id: number; slug: string; display_name: string }[]>`
    SELECT id, slug, display_name FROM core.players WHERE id = ${id}`;
  return p;
}

export async function playerRoutes(app: FastifyInstance, ctx: ApiContext): Promise<void> {
  const { sql } = ctx;
  const ORDERS = ['partidos', 'goles', 'nombre'] as const;

  app.get('/api/v1/jugadores', { schema: { response: { 200: Envelope(PlayerList) } } }, async (req) => {
    const { filters, ignored, from, to } = filtersFrom(ctx, req, ['temporada', 'desde', 'hasta', 'rama', 'equipo', 'torneo', 'orden', 'pagina'], ORDERS);
    const parts: Fragment[] = [];
    if (from !== undefined) parts.push(sql`pa.season_year >= ${from}`);
    if (to !== undefined) parts.push(sql`pa.season_year <= ${to}`);
    if (filters.rama) parts.push(sql`pa.category = ${filters.rama}`);
    if (filters.equipo) parts.push(sql`pa.team_id = ${filters.equipo}`);
    if (filters.torneo) parts.push(sql`pa.tournament_id = ${filters.torneo}`);
    const order =
      filters.orden === 'nombre'
        ? sql`p.display_name ASC`
        : filters.orden === 'goles'
          ? sql`goals DESC, apps DESC, p.display_name`
          : sql`apps DESC, goals DESC, p.display_name`;
    const page = filters.pagina ?? 1;
    const rows = await sql<
      { id: number; slug: string; name: string; apps: number; goals: number; y0: number; y1: number; team_ids: number[]; total: number }[]
    >`
      SELECT p.id, p.slug, p.display_name AS name, sum(pa.apps)::int AS apps, sum(pa.goals)::int AS goals,
             min(pa.season_year) AS y0, max(pa.season_year) AS y1,
             (array_agg(pa.team_id ORDER BY pa.apps DESC)) AS team_ids,
             count(*) OVER ()::int AS total
      FROM stats.player_agg pa JOIN core.players p ON p.id = pa.player_id
      WHERE ${and(sql, parts)}
      GROUP BY p.id, p.slug, p.display_name
      ORDER BY ${order}
      LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`;
    const teams = await teamsById(sql, [...new Set(rows.flatMap((r) => r.team_ids))]);
    return {
      data: {
        items: rows.map((r) => ({
          player: playerRef(r.id, r.slug, r.name),
          teams: [...new Set(r.team_ids)].slice(0, 3).map((t) => teams.get(t)!),
          firstYear: r.y0,
          lastYear: r.y1,
          apps: r.apps,
          goals: r.goals,
        })),
        total: rows[0]?.total ?? 0,
        page,
        pageSize: PAGE_SIZE,
      },
      meta: meta(ctx, ignored),
    };
  });

  app.get<{ Params: { id: string } }>('/api/v1/jugadores/:id', { schema: { response: { 200: Envelope(PlayerProfile) } } }, async (req) => {
    const id = idParam(req.params.id);
    const p = await playerExists(sql, id);
    if (!p) throw notFound('jugador');
    const [names, teamRows, edges, titles, cov, totals] = await Promise.all([
      sql<{ display_name: string }[]>`
        SELECT display_name FROM core.player_names WHERE player_id = ${id} AND display_name <> ${p.display_name} ORDER BY last_year DESC`,
      sql<{ team_id: number; seasons: number[]; apps: number; category: Category }[]>`
        SELECT team_id, array_agg(DISTINCT season_year ORDER BY season_year) AS seasons, sum(apps)::int AS apps, min(category) AS category
        FROM stats.player_agg WHERE player_id = ${id} GROUP BY team_id ORDER BY min(season_year)`,
      sql<{ first_id: number | null; last_id: number | null }[]>`
        SELECT (SELECT match_id FROM stats.player_match WHERE player_id = ${id} ORDER BY kickoff_order LIMIT 1) AS first_id,
               (SELECT match_id FROM stats.player_match WHERE player_id = ${id} ORDER BY kickoff_order DESC LIMIT 1) AS last_id`,
      sql<{ tournament_id: number; team_id: number }[]>`
        SELECT DISTINCT pa.tournament_id, pa.team_id FROM stats.player_agg pa
        JOIN stats.champions c ON c.tournament_id = pa.tournament_id AND c.team_id = pa.team_id
        WHERE pa.player_id = ${id}`,
      sql<{ team_goals: number; attributed: number; yellow_seasons: number[] }[]>`
        SELECT coalesce(sum(pa.team_goals), 0)::int AS team_goals, coalesce(sum(pa.team_goals_attributed), 0)::int AS attributed,
               coalesce((SELECT array_agg(DISTINCT c.season_year ORDER BY c.season_year) FROM stats.coverage c
                         WHERE c.yellow_cards > 0
                           AND (c.season_year, c.category) IN (SELECT season_year, category FROM stats.player_agg WHERE player_id = ${id})), '{}') AS yellow_seasons
        FROM stats.player_agg pa WHERE pa.player_id = ${id}`,
      playerTotals(sql, sql`pa.player_id = ${id}`),
    ]);
    const e = edges[0];
    const [teams, tournaments, matches] = await Promise.all([
      teamsById(sql, [...teamRows.map((t) => t.team_id), ...titles.map((t) => t.team_id)]),
      tournamentsById(sql, titles.map((t) => t.tournament_id)),
      matchesById(sql, [e?.first_id, e?.last_id].filter((x): x is number => typeof x === 'number')),
    ]);
    const c = cov[0]!;
    const yellowSeasons = c.yellow_seasons;
    return {
      data: {
        player: playerRef(p.id, p.slug, p.display_name),
        otherNames: names.map((n) => n.display_name),
        categories: [...new Set(teamRows.map((t) => t.category))],
        teams: teamRows.map((t) => ({ team: teams.get(t.team_id)!, seasons: t.seasons, apps: t.apps })),
        firstMatch: e?.first_id ? (matches.get(e.first_id) ?? null) : null,
        lastMatch: e?.last_id ? (matches.get(e.last_id) ?? null) : null,
        totals,
        titles: titles
          .map((t) => ({ tournament: tournaments.get(t.tournament_id)!, team: teams.get(t.team_id)! }))
          .sort((a, b) => b.tournament.seasonYear - a.tournament.seasonYear),
        coverage: {
          goalsTotal: c.team_goals,
          goalsAttributed: c.attributed,
          attributedShare: c.team_goals > 0 ? round2(c.attributed / c.team_goals) : null,
          yellowSeasons,
        },
      },
      meta: meta(ctx),
    };
  });

  app.get<{ Params: { id: string } }>('/api/v1/jugadores/:id/temporadas', { schema: { response: { 200: Envelope(PlayerSeasons) } } }, async (req) => {
    const id = idParam(req.params.id);
    if (!(await playerExists(sql, id))) throw notFound('jugador');
    const rows = await sql<(TotalsRow & { season_year: number; team_id: number; category: Category })[]>`
      SELECT season_year, team_id, min(category) AS category, sum(apps)::int AS apps, sum(goals)::int AS goals,
             sum(own_goals)::int AS own_goals, sum(yellow)::int AS yellow, sum(red)::int AS red, sum(captain)::int AS captain,
             sum(wins)::int AS wins, sum(draws)::int AS draws, sum(losses)::int AS losses, sum(hat_tricks)::int AS hat_tricks
      FROM stats.player_agg WHERE player_id = ${id}
      GROUP BY season_year, team_id ORDER BY season_year DESC, apps DESC`;
    const teams = await teamsById(sql, rows.map((r) => r.team_id));
    return {
      data: {
        rows: rows.map((r) => ({
          seasonYear: r.season_year,
          team: teams.get(r.team_id)!,
          category: r.category,
          apps: r.apps,
          goals: r.goals,
          yellow: r.yellow,
          red: r.red,
          captain: r.captain,
          wins: r.wins,
          draws: r.draws,
          losses: r.losses,
        })),
        totals: await playerTotals(sql, sql`pa.player_id = ${id}`),
      },
      meta: meta(ctx),
    };
  });

  app.get<{ Params: { id: string } }>('/api/v1/jugadores/:id/partidos', { schema: { response: { 200: Envelope(PlayerMatches) } } }, async (req) => {
    const id = idParam(req.params.id);
    if (!(await playerExists(sql, id))) throw notFound('jugador');
    const { filters, ignored, from, to } = filtersFrom(ctx, req, ['temporada', 'desde', 'hasta', 'torneo', 'tipo', 'equipo', 'rival']);
    const parts: Fragment[] = [sql`pm.player_id = ${id}`];
    if (from !== undefined) parts.push(sql`pm.season_year >= ${from}`);
    if (to !== undefined) parts.push(sql`pm.season_year <= ${to}`);
    if (filters.torneo) parts.push(sql`pm.tournament_id = ${filters.torneo}`);
    if (filters.tipo) parts.push(sql`pm.tournament_kind = ${filters.tipo}`);
    if (filters.equipo) parts.push(sql`pm.team_id = ${filters.equipo}`);
    if (filters.rival) parts.push(sql`pm.opponent_id = ${filters.rival}`);
    const rows = await sql<
      { match_id: number; team_id: number; opponent_id: number; result: Result; goals: number; own_goals: number; yellow: number; red: number; captain: boolean; shirt: number | null }[]
    >`
      SELECT match_id, team_id, opponent_id, result, goals, own_goals, yellow, red, captain, shirt
      FROM stats.player_match pm WHERE ${and(sql, parts)} ORDER BY kickoff_order DESC`;
    const [matches, teams] = await Promise.all([
      matchesById(sql, rows.map((r) => r.match_id)),
      teamsById(sql, [...new Set(rows.flatMap((r) => [r.team_id, r.opponent_id]))]),
    ]);
    return {
      data: {
        rows: rows.map((r) => ({
          match: matches.get(r.match_id)!,
          team: teams.get(r.team_id)!,
          opponent: teams.get(r.opponent_id)!,
          result: r.result,
          goals: r.goals,
          ownGoals: r.own_goals,
          yellow: r.yellow,
          red: r.red,
          captain: r.captain,
          shirt: r.shirt,
        })),
        total: rows.length,
      },
      meta: meta(ctx, ignored),
    };
  });

  app.get<{ Params: { id: string } }>('/api/v1/jugadores/:id/hitos', { schema: { response: { 200: Envelope(PlayerMilestones) } } }, async (req) => {
    const id = idParam(req.params.id);
    if (!(await playerExists(sql, id))) throw notFound('jugador');
    const rows = await sql<{ kind: 'first_match' | 'first_goal' | 'apps' | 'goals' | 'best_match'; value: number; match_id: number; team_id: number; opponent_id: number }[]>`
      SELECT kind, value, match_id, team_id, opponent_id FROM stats.milestones WHERE player_id = ${id} ORDER BY kickoff, kind`;
    const [matches, teams, totals] = await Promise.all([
      matchesById(sql, rows.map((r) => r.match_id)),
      teamsById(sql, [...new Set(rows.flatMap((r) => [r.team_id, r.opponent_id]))]),
      playerTotals(sql, sql`pa.player_id = ${id}`),
    ]);
    return {
      data: {
        milestones: rows.map((r) => ({
          kind: r.kind,
          value: r.value,
          match: matches.get(r.match_id)!,
          team: teams.get(r.team_id)!,
          opponent: teams.get(r.opponent_id)!,
        })),
        hatTricks: totals.hatTricks,
      },
      meta: meta(ctx),
    };
  });

  app.get<{ Params: { id: string } }>('/api/v1/jugadores/:id/rivales', { schema: { response: { 200: Envelope(PlayerOpponents) } } }, async (req) => {
    const id = idParam(req.params.id);
    if (!(await playerExists(sql, id))) throw notFound('jugador');
    const { filters, ignored, from, to } = filtersFrom(ctx, req, ['temporada', 'desde', 'hasta', 'torneo', 'tipo']);
    const parts: Fragment[] = [sql`po.player_id = ${id}`];
    if (from !== undefined) parts.push(sql`po.season_year >= ${from}`);
    if (to !== undefined) parts.push(sql`po.season_year <= ${to}`);
    if (filters.torneo) parts.push(sql`po.tournament_id = ${filters.torneo}`);
    if (filters.tipo) parts.push(sql`po.tournament_kind = ${filters.tipo}`);
    const rows = await sql<{ opponent_id: number; played: number; wins: number; draws: number; losses: number; goals: number; yellow: number; red: number }[]>`
      SELECT opponent_id, sum(apps)::int AS played, sum(wins)::int AS wins, sum(draws)::int AS draws, sum(losses)::int AS losses,
             sum(goals)::int AS goals, sum(yellow)::int AS yellow, sum(red)::int AS red
      FROM stats.player_opponent_agg po WHERE ${and(sql, parts)}
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
          goals: r.goals,
          yellow: r.yellow,
          red: r.red,
        })),
      },
      meta: meta(ctx, ignored),
    };
  });
}
