import { Envelope, Home, type Category, type Kind } from '@ligapedia/contracts';
import type { FastifyInstance } from 'fastify';
import { meta, type ApiContext } from '../context';
import { matchColumns, matchJoins, toMatchSummary, toTournamentRef, type MatchRow } from '../queries/common';
import { phaseStandings, topScorers } from './competitions';

export async function homeRoutes(app: FastifyInstance, ctx: ApiContext): Promise<void> {
  const { sql } = ctx;

  app.get('/api/v1/inicio', { schema: { response: { 200: Envelope(Home) } } }, async () => {
    const [latest] = await sql<{ year: number | null }[]>`
      SELECT max(season_year) AS year FROM core.matches WHERE status = 'jugado'`;
    const year = latest?.year ?? null;
    const [recent, upcoming, phases, totals, scorer, apps, titles, bigWin] = await Promise.all([
      sql<MatchRow[]>`SELECT ${matchColumns(sql)} FROM core.matches m ${matchJoins(sql)}
        WHERE m.status = 'jugado' ORDER BY m.kickoff_order DESC LIMIT 8`,
      sql<MatchRow[]>`SELECT ${matchColumns(sql)} FROM core.matches m ${matchJoins(sql)}
        WHERE m.status = 'programado' AND (m.kickoff IS NULL OR m.kickoff >= now() - interval '1 day')
        ORDER BY m.kickoff NULLS LAST LIMIT 8`,
      year === null
        ? Promise.resolve([])
        : sql<{ id: number; name: string; category: Category; t_id: number; t_slug: string; t_name: string; t_year: number; t_cat: Category; t_kind: Kind }[]>`
            SELECT DISTINCT ON (p.category) p.id, p.name, p.category,
                   t.id AS t_id, t.slug AS t_slug, t.name AS t_name, t.season_year AS t_year, t.category AS t_cat, t.kind AS t_kind
            FROM core.phases p JOIN core.tournaments t ON t.id = p.tournament_id
            WHERE p.season_year = ${year} AND p.role = 'league'
              AND EXISTS (SELECT 1 FROM core.matches m WHERE m.phase_id = p.id AND m.status = 'jugado')
            ORDER BY p.category DESC, p.end_date DESC NULLS LAST, p.id DESC`,
      sql<{ seasons: number; matches: number; goals: number; players: number; teams: number }[]>`
        SELECT (SELECT count(*) FROM core.seasons)::int AS seasons,
               (SELECT count(*) FROM core.matches WHERE status = 'jugado')::int AS matches,
               (SELECT coalesce(sum(home_goals + away_goals), 0) FROM core.matches WHERE status = 'jugado' AND NOT walk_over)::int AS goals,
               (SELECT count(*) FROM core.players)::int AS players,
               (SELECT count(*) FROM core.teams)::int AS teams`,
      sql<{ id: number; slug: string; name: string; goals: number }[]>`
        SELECT p.id, p.slug, p.display_name AS name, sum(pa.goals)::int AS goals FROM stats.player_agg pa
        JOIN core.players p ON p.id = pa.player_id GROUP BY p.id ORDER BY goals DESC, p.display_name LIMIT 1`,
      sql<{ id: number; slug: string; name: string; apps: number }[]>`
        SELECT p.id, p.slug, p.display_name AS name, sum(pa.apps)::int AS apps FROM stats.player_agg pa
        JOIN core.players p ON p.id = pa.player_id GROUP BY p.id ORDER BY apps DESC, p.display_name LIMIT 1`,
      sql<{ id: number; slug: string; name: string; category: Category; titles: number }[]>`
        SELECT t.id, t.slug, t.display_name AS name, t.category, count(*)::int AS titles FROM stats.champions c
        JOIN core.teams t ON t.id = c.team_id JOIN core.tournaments tt ON tt.id = c.tournament_id
        WHERE tt.kind <> 'otro' GROUP BY t.id ORDER BY titles DESC, t.display_name LIMIT 1`,
      sql<MatchRow[]>`SELECT ${matchColumns(sql)} FROM stats.records_match r JOIN core.matches m ON m.id = r.match_id ${matchJoins(sql)}
        ORDER BY r.goal_diff DESC, r.winner_goals DESC LIMIT 1`,
    ]);
    const categories = year === null ? [] : (['M', 'F'] as const);
    const [standingRows, scorerRows] = await Promise.all([
      Promise.all(phases.map(async (p) => ({ p, s: await phaseStandings(sql, p.id) }))),
      Promise.all(categories.map(async (category) => ({ category, scorers: await topScorers(sql, sql`pa.season_year = ${year} AND pa.category = ${category}`, 5) }))),
    ]);
    const standings = standingRows
      .filter((x) => x.s)
      .map(({ p, s }) => ({ tournament: toTournamentRef(p), phaseName: p.name, phaseId: p.id, standings: s! }));
    const scorers = scorerRows.filter((x) => x.scorers.length);
    return {
      data: {
        seasonYear: year,
        recentResults: recent.map(toMatchSummary),
        upcoming: upcoming.map(toMatchSummary),
        standings,
        topScorers: scorers,
        highlights: {
          allTimeTopScorer: scorer[0] ?? null,
          mostApps: apps[0] ?? null,
          mostTitles: titles[0] ?? null,
          biggestWin: bigWin[0] ? toMatchSummary(bigWin[0]) : null,
        },
        totals: totals[0]!,
      },
      meta: meta(ctx),
    };
  });
}
