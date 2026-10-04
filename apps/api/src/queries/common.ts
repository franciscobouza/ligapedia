import type {
  Category,
  Coverage,
  Kind,
  MatchSummary,
  PhaseRef,
  PlayerRef,
  Role,
  TeamRef,
  TournamentRef,
} from '@ligapedia/contracts';
import type { Sql } from '@ligapedia/db';
import type postgres from 'postgres';

export type Fragment = postgres.PendingQuery<postgres.Row[]>;

/** AND-join SQL fragments (TRUE when empty). */
export function and(sql: Sql, parts: Fragment[]): Fragment {
  return parts.reduce<Fragment>((acc, p) => sql`${acc} AND ${p}`, sql`TRUE`);
}

export const teamRef = (id: number, slug: string, name: string, category: Category): TeamRef => ({ id, slug, name, category });
export const playerRef = (id: number, slug: string, name: string): PlayerRef => ({ id, slug, name });

export const round2 = (v: number | null): number | null => (v === null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);
export const ratio = (num: number, den: number): number | null => (den > 0 ? round2(num / den) : null);
export const pct = (num: number, den: number): number | null => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

/** Columns selected by matchFrom(), mapped by toMatchSummary(). */
export interface MatchRow {
  m_id: number;
  m_kickoff: Date | null;
  m_doubtful: boolean;
  m_round: number;
  m_status: 'jugado' | 'programado';
  m_hg: number | null;
  m_ag: number | null;
  m_wo: boolean;
  m_venue: string | null;
  h_id: number;
  h_slug: string;
  h_name: string;
  h_cat: Category;
  a_id: number;
  a_slug: string;
  a_name: string;
  a_cat: Category;
  t_id: number;
  t_slug: string;
  t_name: string;
  t_year: number;
  t_cat: Category;
  t_kind: Kind;
  p_id: number;
  p_slug: string;
  p_name: string;
  p_role: Role;
}

/** SELECT list + joins producing MatchRow columns for core.matches aliased `m`. */
export function matchColumns(sql: Sql): Fragment {
  return sql`
    m.id AS m_id, m.kickoff AS m_kickoff, m.doubtful_date AS m_doubtful, m.round AS m_round, m.status AS m_status,
    m.home_goals AS m_hg, m.away_goals AS m_ag, m.walk_over AS m_wo, v.display_name AS m_venue,
    h.id AS h_id, h.slug AS h_slug, h.display_name AS h_name, h.category AS h_cat,
    a.id AS a_id, a.slug AS a_slug, a.display_name AS a_name, a.category AS a_cat,
    t.id AS t_id, t.slug AS t_slug, t.name AS t_name, t.season_year AS t_year, t.category AS t_cat, t.kind AS t_kind,
    p.id AS p_id, p.slug AS p_slug, p.name AS p_name, p.role AS p_role`;
}

export function matchJoins(sql: Sql): Fragment {
  return sql`
    JOIN core.teams h ON h.id = m.home_team_id
    JOIN core.teams a ON a.id = m.away_team_id
    JOIN core.tournaments t ON t.id = m.tournament_id
    JOIN core.phases p ON p.id = m.phase_id
    LEFT JOIN core.venues v ON v.id = m.venue_id`;
}

export function toTournamentRef(r: { t_id: number; t_slug: string; t_name: string; t_year: number; t_cat: Category; t_kind: Kind }): TournamentRef {
  return { id: r.t_id, slug: r.t_slug, name: r.t_name, seasonYear: r.t_year, category: r.t_cat, kind: r.t_kind };
}

export function toPhaseRef(r: { p_id: number; p_slug: string; p_name: string; p_role: Role }): PhaseRef {
  return { id: r.p_id, slug: r.p_slug, name: r.p_name, role: r.p_role };
}

export function toMatchSummary(r: MatchRow): MatchSummary {
  return {
    id: r.m_id,
    kickoff: r.m_kickoff ? r.m_kickoff.toISOString() : null,
    doubtfulDate: r.m_doubtful,
    round: r.m_round,
    status: r.m_status,
    home: teamRef(r.h_id, r.h_slug, r.h_name, r.h_cat),
    away: teamRef(r.a_id, r.a_slug, r.a_name, r.a_cat),
    homeGoals: r.m_hg,
    awayGoals: r.m_ag,
    walkOver: r.m_wo,
    venue: r.m_venue,
    tournament: toTournamentRef(r),
    phase: toPhaseRef(r),
  };
}

/** Fetch match summaries for a set of match ids, keyed by id. */
export async function matchesById(sql: Sql, ids: number[]): Promise<Map<number, MatchSummary>> {
  if (ids.length === 0) return new Map();
  const rows = await sql<MatchRow[]>`
    SELECT ${matchColumns(sql)} FROM core.matches m ${matchJoins(sql)}
    WHERE m.id = ANY(${sql.array(ids)}::int[])`;
  return new Map(rows.map((r) => [r.m_id, toMatchSummary(r)]));
}

export async function teamsById(sql: Sql, ids: number[]): Promise<Map<number, TeamRef>> {
  if (ids.length === 0) return new Map();
  const rows = await sql<{ id: number; slug: string; display_name: string; category: Category }[]>`
    SELECT id, slug, display_name, category FROM core.teams WHERE id = ANY(${sql.array(ids)}::int[])`;
  return new Map(rows.map((r) => [r.id, teamRef(r.id, r.slug, r.display_name, r.category)]));
}

export async function playersById(sql: Sql, ids: number[]): Promise<Map<number, PlayerRef>> {
  if (ids.length === 0) return new Map();
  const rows = await sql<{ id: number; slug: string; display_name: string }[]>`
    SELECT id, slug, display_name FROM core.players WHERE id = ANY(${sql.array(ids)}::int[])`;
  return new Map(rows.map((r) => [r.id, playerRef(r.id, r.slug, r.display_name)]));
}

export async function tournamentsById(sql: Sql, ids: number[]): Promise<Map<number, TournamentRef>> {
  if (ids.length === 0) return new Map();
  const rows = await sql<{ t_id: number; t_slug: string; t_name: string; t_year: number; t_cat: Category; t_kind: Kind }[]>`
    SELECT id AS t_id, slug AS t_slug, name AS t_name, season_year AS t_year, category AS t_cat, kind AS t_kind
    FROM core.tournaments WHERE id = ANY(${sql.array(ids)}::int[])`;
  return new Map(rows.map((r) => [r.t_id, toTournamentRef(r)]));
}

/** Coverage figures for a scope over stats.coverage. */
export async function coverageFor(sql: Sql, where: Fragment): Promise<Coverage> {
  const [row] = await sql<{ total: number; attributed: number; years: number[] }[]>`
    SELECT coalesce(sum(goals_total), 0)::int AS total, coalesce(sum(goals_attributed), 0)::int AS attributed,
           coalesce(array_agg(DISTINCT season_year ORDER BY season_year) FILTER (WHERE yellow_cards > 0), '{}') AS years
    FROM stats.coverage WHERE ${where}`;
  const total = row?.total ?? 0;
  const attributed = row?.attributed ?? 0;
  return {
    goalsTotal: total,
    goalsAttributed: attributed,
    attributedShare: total > 0 ? round2(attributed / total) : null,
    yellowSeasons: row?.years ?? [],
  };
}
