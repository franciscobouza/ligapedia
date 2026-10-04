import type { Sql } from '@ligapedia/db';
import type { Overrides } from '@ligapedia/domain';
import { rebuildCore } from './normalize';
import { publishNext, sanityGates, type PublishResult } from './publish';
import type { RunReport } from './runs';
import { buildStats, type StatsBuildReport } from './stats';

export class GateError extends Error {
  constructor(readonly failures: string[]) {
    super(`Sanity gates failed: ${failures.join('; ')}`);
  }
}

export interface BuildPublishResult extends PublishResult {
  counts: Record<string, number>;
  stats: StatsBuildReport;
}

/** Rebuild core_next and stats_next from the archive, check the gates, then publish atomically. */
export async function buildAndPublish(sql: Sql, overrides: Overrides, runId: number | null, report: RunReport): Promise<BuildPublishResult> {
  const { draft, ids } = await rebuildCore(sql, overrides);
  report.unknownPhases = draft.report.unrecognizedPhases;
  report.unresolvedCards = draft.report.unresolvedCards;
  report.inconsistentMatches = draft.report.inconsistentMatches;
  if (draft.report.seasonYearConflicts.length)
    report.notes.push(`season codes with a conflicting published year (code-derived year used): ${draft.report.seasonYearConflicts.join(', ')}`);
  const createdTeams = new Set(ids.created.teams);
  report.newTeamNames = draft.teams.filter((t) => createdTeams.has(t.key)).map((t) => `${t.name} (${t.category})`);
  const gates = await sanityGates(sql, draft);
  if (!gates.ok) {
    report.gateFailures = gates.failures;
    throw new GateError(gates.failures);
  }
  const stats = await buildStats(sql, overrides);
  if (stats.unknownOverrideTeams.length) report.notes.push(`champion overrides name unknown teams: ${stats.unknownOverrideTeams.join(', ')}`);
  const counts = {
    seasons: draft.seasons.length,
    tournaments: draft.tournaments.length,
    phases: draft.phases.length,
    teams: draft.teams.length,
    players: draft.players.length,
    matches: draft.matches.length,
  };
  const published = await publishNext(sql, { runId, counts });
  return { ...published, counts, stats };
}
