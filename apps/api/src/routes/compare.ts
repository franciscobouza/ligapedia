import { Envelope, PlayerComparison, TeamComparison } from '@ligapedia/contracts';
import type { FastifyInstance } from 'fastify';
import { filtersFrom, meta, type ApiContext } from '../context';
import { notFound } from '../errors';
import { and, matchesById, playerRef, teamRef, type Fragment } from '../queries/common';
import { playerExists, playerTotals } from './players';
import { teamExists } from './teams';

export async function compareRoutes(app: FastifyInstance, ctx: ApiContext): Promise<void> {
  const { sql } = ctx;

  app.get('/api/v1/comparar/equipos', { schema: { response: { 200: Envelope(TeamComparison) } } }, async (req) => {
    const { filters, ignored, from, to } = filtersFrom(ctx, req, ['a', 'b', 'temporada', 'desde', 'hasta', 'torneo', 'tipo']);
    const [ta, tb] = await Promise.all([teamExists(sql, filters.a ?? NaN), teamExists(sql, filters.b ?? NaN)]);
    if (!ta || !tb) throw notFound('equipo');
    const parts: Fragment[] = [sql`tm.team_id = ${ta.id}`, sql`tm.opponent_id = ${tb.id}`];
    if (from !== undefined) parts.push(sql`tm.season_year >= ${from}`);
    if (to !== undefined) parts.push(sql`tm.season_year <= ${to}`);
    if (filters.torneo) parts.push(sql`tm.tournament_id = ${filters.torneo}`);
    if (filters.tipo) parts.push(sql`tm.tournament_kind = ${filters.tipo}`);
    const rows = await sql<{ match_id: number; result: 'G' | 'E' | 'P'; gf: number; ga: number; walk_over: boolean }[]>`
      SELECT match_id, result, gf, ga, walk_over FROM stats.team_match tm WHERE ${and(sql, parts)} ORDER BY kickoff_order DESC`;
    const best = (result: 'G' | 'P') =>
      rows
        .filter((r) => r.result === result && !r.walk_over)
        .sort((x, y) => (result === 'G' ? y.gf - y.ga - (x.gf - x.ga) || y.gf - x.gf : x.gf - x.ga - (y.gf - y.ga) || y.ga - x.ga))[0]?.match_id ?? null;
    const bigA = best('G');
    const bigB = best('P');
    const matches = await matchesById(sql, rows.map((r) => r.match_id));
    return {
      data: {
        a: teamRef(ta.id, ta.slug, ta.display_name, ta.category),
        b: teamRef(tb.id, tb.slug, tb.display_name, tb.category),
        played: rows.length,
        winsA: rows.filter((r) => r.result === 'G').length,
        winsB: rows.filter((r) => r.result === 'P').length,
        draws: rows.filter((r) => r.result === 'E').length,
        goalsA: rows.reduce((n, r) => n + r.gf, 0),
        goalsB: rows.reduce((n, r) => n + r.ga, 0),
        biggestWinA: bigA ? (matches.get(bigA) ?? null) : null,
        biggestWinB: bigB ? (matches.get(bigB) ?? null) : null,
        matches: rows.map((r) => matches.get(r.match_id)!),
      },
      meta: meta(ctx, ignored),
    };
  });

  app.get('/api/v1/comparar/jugadores', { schema: { response: { 200: Envelope(PlayerComparison) } } }, async (req) => {
    const { filters, ignored } = filtersFrom(ctx, req, ['a', 'b']);
    const [pa, pb] = await Promise.all([playerExists(sql, filters.a ?? NaN), playerExists(sql, filters.b ?? NaN)]);
    if (!pa || !pb) throw notFound('jugador');
    const rows = await sql<{ match_id: number; same_team: boolean; result: 'G' | 'E' | 'P'; goals_a: number; goals_b: number }[]>`
      SELECT x.match_id, x.team_id = y.team_id AS same_team, x.result, x.goals AS goals_a, y.goals AS goals_b
      FROM stats.player_match x JOIN stats.player_match y ON y.match_id = x.match_id AND y.player_id = ${pb.id}
      WHERE x.player_id = ${pa.id}
      ORDER BY x.kickoff_order DESC`;
    const opp = rows.filter((r) => !r.same_team);
    const mates = rows.filter((r) => r.same_team);
    const [matches, totalsA, totalsB] = await Promise.all([
      matchesById(sql, rows.map((r) => r.match_id)),
      playerTotals(sql, sql`pa.player_id = ${pa.id}`),
      playerTotals(sql, sql`pa.player_id = ${pb.id}`),
    ]);
    return {
      data: {
        a: playerRef(pa.id, pa.slug, pa.display_name),
        b: playerRef(pb.id, pb.slug, pb.display_name),
        opponents: {
          played: opp.length,
          winsA: opp.filter((r) => r.result === 'G').length,
          draws: opp.filter((r) => r.result === 'E').length,
          lossesA: opp.filter((r) => r.result === 'P').length,
          goalsA: opp.reduce((n, r) => n + r.goals_a, 0),
          goalsB: opp.reduce((n, r) => n + r.goals_b, 0),
          matches: opp.map((r) => ({ match: matches.get(r.match_id)!, goalsA: r.goals_a, goalsB: r.goals_b })),
        },
        teammates: {
          played: mates.length,
          wins: mates.filter((r) => r.result === 'G').length,
          draws: mates.filter((r) => r.result === 'E').length,
          losses: mates.filter((r) => r.result === 'P').length,
          matches: mates.map((r) => matches.get(r.match_id)!),
        },
        totalsA,
        totalsB,
      },
      meta: meta(ctx, ignored),
    };
  });
}
