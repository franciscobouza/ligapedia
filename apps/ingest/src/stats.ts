import { ident, statsIndexesDDL, statsSteps, statsTablesDDL, type Sql } from '@ligapedia/db';
import {
  determineChampion,
  findChampionOverride,
  normalizeName,
  type Category,
  type ChampionPhase,
  type Overrides,
  type PhaseRole,
  type TournamentKind,
} from '@ligapedia/domain';
import { insertRows } from './normalize/load';

export interface StatsBuildReport {
  steps: Array<{ name: string; ms: number }>;
  champions: { determined: number; undetermined: number; overridden: number };
  unknownOverrideTeams: string[];
}

/** Compute champions with the domain rule and write stats.champions. */
async function computeChampions(sql: Sql, overrides: Overrides, core: string, stats: string): Promise<StatsBuildReport['champions'] & { unknown: string[] }> {
  const C = ident(core);
  const S = ident(stats);
  const tournaments = await sql.unsafe<{ id: number; season_year: number; category: Category; kind: TournamentKind; name: string }[]>(
    `SELECT id, season_year, category, kind, name FROM ${C}.tournaments`,
  );
  const phases = await sql.unsafe<{ id: number; tournament_id: number; role: PhaseRole; sort_order: number }[]>(
    `SELECT id, tournament_id, role, sort_order FROM ${C}.phases`,
  );
  const matches = await sql.unsafe<
    { phase_id: number; home_team_id: number; away_team_id: number; home_goals: number | null; away_goals: number | null; kickoff_order: number }[]
  >(`SELECT phase_id, home_team_id, away_team_id, home_goals, away_goals, kickoff_order FROM ${C}.matches WHERE status = 'jugado'`);
  const official = await sql.unsafe<{ phase_id: number; team_id: number }[]>(
    `SELECT phase_id, team_id FROM ${C}.standings_official WHERE position = 1`,
  );
  const computed = await sql.unsafe<{ phase_id: number; team_id: number }[]>(
    `SELECT DISTINCT ON (phase_id) phase_id, team_id FROM ${S}.standings_by_round WHERE position = 1 ORDER BY phase_id, after_round DESC`,
  );
  const teamNames = await sql.unsafe<{ team_id: number; category: Category; name: string }[]>(
    `SELECT t.id AS team_id, t.category, n.name FROM ${C}.teams t JOIN ${C}.team_names n ON n.team_id = t.id
     UNION SELECT id, category, name FROM ${C}.teams`,
  );
  const teamByName = new Map(teamNames.map((t) => [`${t.category}:${normalizeName(t.name)}`, t.team_id]));
  const leader = new Map<number, number>();
  for (const r of computed) leader.set(r.phase_id, r.team_id);
  for (const r of official) leader.set(r.phase_id, r.team_id); // official wins
  type M = (typeof matches)[number];
  const matchesByPhase = new Map<number, M[]>();
  for (const m of matches) matchesByPhase.set(m.phase_id, [...(matchesByPhase.get(m.phase_id) ?? []), m]);

  const rows: Array<Record<string, unknown>> = [];
  const result = { determined: 0, undetermined: 0, overridden: 0, unknown: [] as string[] };
  for (const t of tournaments) {
    const base = { tournament_id: t.id, season_year: t.season_year, category: t.category, kind: t.kind };
    const o = findChampionOverride(overrides.champions, { seasonYear: t.season_year, category: t.category, kind: t.kind, name: t.name });
    if (o) {
      const teamId = o.team === null ? null : (teamByName.get(`${t.category}:${normalizeName(o.team)}`) ?? null);
      if (o.team !== null && teamId === null) result.unknown.push(o.team);
      rows.push({ ...base, team_id: teamId, method: teamId === null ? 'undetermined' : 'override' });
      result.overridden++;
      continue;
    }
    const tPhases: ChampionPhase<number>[] = phases
      .filter((p) => p.tournament_id === t.id)
      .map((p) => ({
        role: p.role,
        sortOrder: p.sort_order,
        leader: leader.get(p.id) ?? null,
        matches: (matchesByPhase.get(p.id) ?? []).map((m) => ({
          home: m.home_team_id,
          away: m.away_team_id,
          homeGoals: m.home_goals,
          awayGoals: m.away_goals,
          order: m.kickoff_order,
        })),
      }));
    const r = determineChampion({ seasonYear: t.season_year, category: t.category, kind: t.kind, name: t.name, phases: tPhases });
    rows.push({ ...base, team_id: r.team, method: r.method });
    if (r.team === null) result.undetermined++;
    else result.determined++;
  }
  await insertRows(sql, stats, 'champions', rows);
  return result;
}

/** Create `stats` (normally stats_next) and fill every read model from `core`. */
export async function buildStats(sql: Sql, overrides: Overrides, core = 'core_next', stats = 'stats_next'): Promise<StatsBuildReport> {
  await sql.unsafe(`DROP SCHEMA IF EXISTS ${ident(stats)} CASCADE`);
  await sql.unsafe(statsTablesDDL(stats));
  const steps: StatsBuildReport['steps'] = [];
  for (const step of statsSteps(core, stats)) {
    const t0 = performance.now();
    try {
      await sql.unsafe(step.sql);
    } catch (err) {
      throw new Error(`stats step ${step.name} failed: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
    }
    steps.push({ name: step.name, ms: Math.round(performance.now() - t0) });
  }
  const t0 = performance.now();
  const champions = await computeChampions(sql, overrides, core, stats);
  steps.push({ name: 'champions', ms: Math.round(performance.now() - t0) });
  await sql.unsafe(statsIndexesDDL(stats));
  await sql.unsafe(`ANALYZE`);
  const { unknown, ...counts } = champions;
  return { steps, champions: counts, unknownOverrideTeams: unknown };
}
