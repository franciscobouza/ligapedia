import { ident } from '../connection';

export interface StatsStep {
  name: string;
  sql: string;
}

/**
 * Ordered SQL that fills the `stats` read models (design D5) from a `core` schema.
 * `core` and `stats` are schema names (normally core_next / stats_next during a publish).
 * Champions are computed afterwards in TypeScript with the domain rule (needs standings_by_round).
 */
export function statsSteps(core: string, stats: string): StatsStep[] {
  const C = ident(core);
  const S = ident(stats);
  const cleanName = (col: string) => `lower(public.f_unaccent(regexp_replace(btrim(${col}), '\\s+', ' ', 'g')))`;
  return [
    {
      name: 'team_match',
      sql: `
INSERT INTO ${S}.team_match
SELECT m.id, x.team_id, x.opponent_id, x.side, m.season_code, m.season_year, m.category, m.tournament_id, t.kind,
       m.phase_id, p.role, m.round, m.kickoff, m.kickoff_order, x.gf, x.ga,
       CASE WHEN x.gf > x.ga THEN 'G' WHEN x.gf = x.ga THEN 'E' ELSE 'P' END,
       coalesce(x.points, CASE WHEN x.gf > x.ga THEN 3 WHEN x.gf = x.ga THEN 1 ELSE 0 END),
       m.walk_over,
       x.ga = 0 AND NOT m.walk_over,
       coalesce(g.n, 0), coalesce(c.yellow, 0), coalesce(c.red, 0)
FROM ${C}.matches m
JOIN ${C}.tournaments t ON t.id = m.tournament_id
JOIN ${C}.phases p ON p.id = m.phase_id
CROSS JOIN LATERAL (VALUES
  ('H', m.home_team_id, m.away_team_id, m.home_goals, m.away_goals, m.home_points),
  ('A', m.away_team_id, m.home_team_id, m.away_goals, m.home_goals, m.away_points)
) AS x(side, team_id, opponent_id, gf, ga, points)
LEFT JOIN (SELECT match_id, side, count(*)::int AS n FROM ${C}.goals GROUP BY 1, 2) g
  ON g.match_id = m.id AND g.side = x.side
LEFT JOIN (SELECT match_id, team_id, count(*) FILTER (WHERE color = 'Y')::int AS yellow,
                  count(*) FILTER (WHERE color = 'R')::int AS red
           FROM ${C}.cards GROUP BY 1, 2) c
  ON c.match_id = m.id AND c.team_id = x.team_id
WHERE m.status = 'jugado'`,
    },
    {
      name: 'player_match',
      sql: `
INSERT INTO ${S}.player_match
SELECT a.match_id, a.player_id, a.team_id, tm.opponent_id, a.side, tm.season_code, tm.season_year, tm.category,
       tm.tournament_id, tm.tournament_kind, tm.phase_id, tm.phase_role, tm.round, tm.kickoff, tm.kickoff_order,
       tm.gf, tm.ga, tm.result,
       coalesce(g.goals, 0), coalesce(g.own_goals, 0), coalesce(c.yellow, 0), coalesce(c.red, 0),
       a.captain, a.shirt
FROM ${C}.appearances a
JOIN ${S}.team_match tm ON tm.match_id = a.match_id AND tm.team_id = a.team_id AND NOT tm.walk_over
LEFT JOIN (SELECT match_id, player_id,
                  count(*) FILTER (WHERE NOT own_goal)::int AS goals,
                  count(*) FILTER (WHERE own_goal)::int AS own_goals
           FROM ${C}.goals GROUP BY 1, 2) g
  ON g.match_id = a.match_id AND g.player_id = a.player_id
LEFT JOIN (SELECT match_id, player_id,
                  count(*) FILTER (WHERE color = 'Y')::int AS yellow,
                  count(*) FILTER (WHERE color = 'R')::int AS red
           FROM ${C}.cards WHERE player_id IS NOT NULL GROUP BY 1, 2) c
  ON c.match_id = a.match_id AND c.player_id = a.player_id`,
    },
    {
      name: 'player_agg',
      sql: `
INSERT INTO ${S}.player_agg
SELECT pm.player_id, pm.season_code, pm.season_year, pm.category, pm.tournament_id, pm.tournament_kind, pm.team_id,
       count(*)::int, sum(pm.goals)::int, sum(pm.own_goals)::int, sum(pm.yellow)::int, sum(pm.red)::int,
       count(*) FILTER (WHERE pm.captain)::int,
       count(*) FILTER (WHERE pm.result = 'G')::int, count(*) FILTER (WHERE pm.result = 'E')::int,
       count(*) FILTER (WHERE pm.result = 'P')::int,
       count(*) FILTER (WHERE pm.goals >= 3)::int,
       sum(tm.gf)::int, sum(least(tm.attributed, tm.gf))::int
FROM ${S}.player_match pm
JOIN ${S}.team_match tm ON tm.match_id = pm.match_id AND tm.team_id = pm.team_id
GROUP BY 1, 2, 3, 4, 5, 6, 7`,
    },
    {
      name: 'team_agg',
      sql: `
INSERT INTO ${S}.team_agg
SELECT team_id, season_code, season_year, category, tournament_id, tournament_kind,
       count(*)::int, count(*) FILTER (WHERE result = 'G')::int, count(*) FILTER (WHERE result = 'E')::int,
       count(*) FILTER (WHERE result = 'P')::int, sum(gf)::int, sum(ga)::int, sum(points)::int,
       count(*) FILTER (WHERE clean_sheet)::int,
       count(*) FILTER (WHERE walk_over AND result = 'G')::int, count(*) FILTER (WHERE walk_over AND result = 'P')::int,
       sum(yellow)::int, sum(red)::int
FROM ${S}.team_match GROUP BY 1, 2, 3, 4, 5, 6`,
    },
    {
      name: 'team_opponent_agg',
      sql: `
INSERT INTO ${S}.team_opponent_agg
SELECT team_id, opponent_id, season_code, season_year, category, tournament_id, tournament_kind,
       count(*)::int, count(*) FILTER (WHERE result = 'G')::int, count(*) FILTER (WHERE result = 'E')::int,
       count(*) FILTER (WHERE result = 'P')::int, sum(gf)::int, sum(ga)::int
FROM ${S}.team_match GROUP BY 1, 2, 3, 4, 5, 6, 7`,
    },
    {
      name: 'player_opponent_agg',
      sql: `
INSERT INTO ${S}.player_opponent_agg
SELECT player_id, opponent_id, season_code, season_year, category, tournament_id, tournament_kind,
       count(*)::int, count(*) FILTER (WHERE result = 'G')::int, count(*) FILTER (WHERE result = 'E')::int,
       count(*) FILTER (WHERE result = 'P')::int, sum(goals)::int, sum(yellow)::int, sum(red)::int
FROM ${S}.player_match GROUP BY 1, 2, 3, 4, 5, 6, 7`,
    },
    {
      name: 'streaks',
      sql: `
WITH tm AS (
  SELECT team_id, match_id, kickoff, kickoff_order, result,
         row_number() OVER (PARTITION BY team_id ORDER BY kickoff_order) AS rn
  FROM ${S}.team_match
), kinds(kind, results) AS (
  VALUES ('win', ARRAY['G']), ('unbeaten', ARRAY['G','E']), ('loss', ARRAY['P']), ('winless', ARRAY['E','P'])
), flagged AS (
  SELECT tm.*, k.kind,
         tm.rn - row_number() OVER (PARTITION BY tm.team_id, k.kind ORDER BY tm.kickoff_order) AS grp
  FROM tm JOIN kinds k ON tm.result = ANY (k.results)
), islands AS (
  SELECT team_id, kind, count(*)::int AS len, max(rn) AS last_rn,
         (array_agg(match_id ORDER BY kickoff_order))[1] AS start_match,
         (array_agg(match_id ORDER BY kickoff_order DESC))[1] AS end_match,
         min(kickoff) AS start_date, max(kickoff) AS end_date
  FROM flagged GROUP BY team_id, kind, grp
), last_match AS (
  SELECT team_id, max(rn) AS last_rn FROM tm GROUP BY team_id
), longest AS (
  SELECT DISTINCT ON (team_id, kind) team_id, kind, 'longest' AS which, len, start_match, end_match, start_date, end_date
  FROM islands ORDER BY team_id, kind, len DESC, last_rn DESC
), cur AS (
  SELECT i.team_id, i.kind, 'current' AS which, i.len, i.start_match, i.end_match, i.start_date, i.end_date
  FROM islands i JOIN last_match l ON l.team_id = i.team_id AND l.last_rn = i.last_rn
)
INSERT INTO ${S}.streaks
SELECT * FROM longest UNION ALL SELECT * FROM cur`,
    },
    {
      name: 'milestones',
      sql: `
WITH pm AS (
  SELECT player_id, match_id, team_id, opponent_id, kickoff, kickoff_order, goals,
         row_number() OVER w AS rn,
         coalesce(sum(goals) OVER (w ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS goals_before,
         sum(goals) OVER (w ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS goals_after
  FROM ${S}.player_match
  WINDOW w AS (PARTITION BY player_id ORDER BY kickoff_order)
)
INSERT INTO ${S}.milestones
SELECT player_id, 'first_match', 1, match_id, team_id, opponent_id, kickoff FROM pm WHERE rn = 1
UNION ALL
SELECT player_id, 'apps', rn::int, match_id, team_id, opponent_id, kickoff FROM pm WHERE rn % 50 = 0
UNION ALL
(SELECT DISTINCT ON (player_id) player_id, 'first_goal', 1, match_id, team_id, opponent_id, kickoff
 FROM pm WHERE goals > 0 ORDER BY player_id, kickoff_order)
UNION ALL
SELECT player_id, 'goals', n::int, match_id, team_id, opponent_id, kickoff
FROM pm CROSS JOIN LATERAL generate_series(50, goals_after::int, 50) AS n
WHERE n > goals_before
UNION ALL
(SELECT DISTINCT ON (player_id) player_id, 'best_match', goals, match_id, team_id, opponent_id, kickoff
 FROM pm WHERE goals > 0 ORDER BY player_id, goals DESC, kickoff_order)`,
    },
    {
      name: 'standings_by_round',
      sql: `
WITH rounds AS (
  SELECT DISTINCT phase_id, round FROM ${S}.team_match
), teams AS (
  SELECT DISTINCT phase_id, team_id FROM ${S}.team_match
), agg AS (
  SELECT r.phase_id, r.round AS after_round, t.team_id,
         count(x.match_id)::int AS pj,
         count(*) FILTER (WHERE x.result = 'G')::int AS pg,
         count(*) FILTER (WHERE x.result = 'E')::int AS pe,
         count(*) FILTER (WHERE x.result = 'P')::int AS pp,
         coalesce(sum(x.gf), 0)::int AS gf, coalesce(sum(x.ga), 0)::int AS gc,
         coalesce(sum(x.points), 0)::int AS pts
  FROM rounds r
  JOIN teams t ON t.phase_id = r.phase_id
  LEFT JOIN ${S}.team_match x ON x.phase_id = r.phase_id AND x.team_id = t.team_id AND x.round <= r.round
  GROUP BY r.phase_id, r.round, t.team_id
)
INSERT INTO ${S}.standings_by_round
SELECT a.phase_id, a.after_round,
       row_number() OVER (PARTITION BY a.phase_id, a.after_round
                          ORDER BY a.pts DESC, a.gf - a.gc DESC, a.gf DESC, tm.display_name)::int,
       a.team_id, a.pj, a.pg, a.pe, a.pp, a.gf, a.gc, a.pts
FROM agg a JOIN ${C}.teams tm ON tm.id = a.team_id`,
    },
    {
      name: 'coverage',
      sql: `
INSERT INTO ${S}.coverage
SELECT m.season_code, m.season_year, m.category, m.tournament_id, t.kind,
       count(*) FILTER (WHERE m.status = 'jugado' AND NOT m.walk_over)::int,
       coalesce(sum(m.home_goals + m.away_goals) FILTER (WHERE m.status = 'jugado' AND NOT m.walk_over), 0)::int,
       coalesce(sum(m.home_goals - m.home_unattributed + m.away_goals - m.away_unattributed)
                FILTER (WHERE m.status = 'jugado' AND NOT m.walk_over), 0)::int,
       coalesce(sum(c.yellow), 0)::int, coalesce(sum(c.red), 0)::int
FROM ${C}.matches m
JOIN ${C}.tournaments t ON t.id = m.tournament_id
LEFT JOIN (SELECT match_id, count(*) FILTER (WHERE color = 'Y') AS yellow, count(*) FILTER (WHERE color = 'R') AS red
           FROM ${C}.cards GROUP BY 1) c ON c.match_id = m.id
GROUP BY 1, 2, 3, 4, 5`,
    },
    {
      name: 'records_match',
      sql: `
INSERT INTO ${S}.records_match
SELECT m.id, m.season_code, m.season_year, m.category, m.tournament_id, t.kind,
       m.home_goals + m.away_goals, abs(m.home_goals - m.away_goals), greatest(m.home_goals, m.away_goals),
       m.home_goals = m.away_goals,
       (SELECT count(*) FROM ${C}.cards c WHERE c.match_id = m.id AND c.color = 'R')::int,
       m.kickoff_order
FROM ${C}.matches m JOIN ${C}.tournaments t ON t.id = m.tournament_id
WHERE m.status = 'jugado' AND NOT m.walk_over`,
    },
    {
      name: 'season_top_scorers',
      sql: `
INSERT INTO ${S}.season_top_scorers
SELECT season_year, category, player_id, goals, apps, rank
FROM (
  SELECT season_year, category, player_id, sum(goals)::int AS goals, sum(apps)::int AS apps,
         rank() OVER (PARTITION BY season_year, category ORDER BY sum(goals) DESC)::int AS rank
  FROM ${S}.player_agg GROUP BY 1, 2, 3
) x
WHERE goals > 0 AND rank <= 10`,
    },
    {
      name: 'search_index',
      sql: `
WITH player_ctx AS (
  SELECT pa.player_id, sum(pa.apps)::int AS apps, min(pa.season_year) AS y0, max(pa.season_year) AS y1,
         (SELECT string_agg(name, ', ') FROM (
            SELECT t.display_name AS name FROM ${S}.player_agg x JOIN ${C}.teams t ON t.id = x.team_id
            WHERE x.player_id = pa.player_id GROUP BY t.display_name ORDER BY sum(x.apps) DESC LIMIT 2) top) AS teams
  FROM ${S}.player_agg pa GROUP BY pa.player_id
), team_ctx AS (
  SELECT team_id, sum(played)::int AS played, min(season_year) AS y0, max(season_year) AS y1
  FROM ${S}.team_agg GROUP BY team_id
)
INSERT INTO ${S}.search_index (entity_type, entity_id, slug, label, matched_name, context, norm, popularity)
SELECT 'player', p.id, p.slug, p.display_name, n.display_name,
       concat_ws(' · ', c.teams, CASE WHEN c.y0 = c.y1 THEN c.y0::text ELSE c.y0 || '–' || c.y1 END),
       ${cleanName('n.name')}, coalesce(c.apps, 0)
FROM ${C}.players p JOIN ${C}.player_names n ON n.player_id = p.id
LEFT JOIN player_ctx c ON c.player_id = p.id
UNION ALL
SELECT 'team', t.id, t.slug, t.display_name, v.name,
       concat_ws(' · ', CASE t.category WHEN 'F' THEN 'Femenino' ELSE 'Masculino' END,
                 CASE WHEN c.y0 = c.y1 THEN c.y0::text ELSE c.y0 || '–' || c.y1 END),
       ${cleanName('v.name')}, coalesce(c.played, 0)
FROM ${C}.teams t
CROSS JOIN LATERAL (SELECT t.display_name AS name UNION SELECT name FROM ${C}.team_names WHERE team_id = t.id) v
LEFT JOIN team_ctx c ON c.team_id = t.id
UNION ALL
SELECT 'tournament', t.id, t.slug, t.name || ' ' || t.season_year, t.name || ' ' || t.season_year,
       CASE t.category WHEN 'F' THEN 'Femenino' ELSE 'Masculino' END,
       ${cleanName("t.name || ' ' || t.season_year")}, t.season_year
FROM ${C}.tournaments t`,
    },
  ];
}
