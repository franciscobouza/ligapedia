import type { Sql } from '@ligapedia/db';
import { montevideoDate } from '@ligapedia/domain';

export type RunStatus = 'running' | 'succeeded' | 'failed' | 'skipped';
export type RunTrigger = 'scheduled' | 'manual';

export interface RunReport {
  requests: number;
  changed: number;
  failed: Array<{ key: string; reason: string }>;
  unknownPhases: Array<{ season: number; torneo: string; serie: string }>;
  newTeamNames: string[];
  unresolvedCards: Array<{ matchId: number; name: string; color: 'Y' | 'R' }>;
  inconsistentMatches: number[];
  gateFailures: string[];
  notes: string[];
}

export const emptyReport = (): RunReport => ({
  requests: 0,
  changed: 0,
  failed: [],
  unknownPhases: [],
  newTeamNames: [],
  unresolvedCards: [],
  inconsistentMatches: [],
  gateFailures: [],
  notes: [],
});

export async function startRun(sql: Sql, command: string, trigger: RunTrigger, forced: boolean, now = new Date()): Promise<number> {
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ops.ingest_runs (command, trigger, forced, status, montevideo_date, started_at)
    VALUES (${command}, ${trigger}, ${forced}, 'running', ${montevideoDate(now)}, ${now})
    RETURNING id`;
  return row!.id;
}

export async function finishRun(
  sql: Sql,
  id: number,
  fields: { status: RunStatus; counts?: Record<string, number>; report?: RunReport; error?: string; datasetVersion?: number },
): Promise<void> {
  await sql`
    UPDATE ops.ingest_runs SET
      status = ${fields.status},
      finished_at = now(),
      counts = ${fields.counts ? sql.json(fields.counts) : null},
      report = ${fields.report ? sql.json(fields.report as never) : null},
      error = ${fields.error ?? null},
      dataset_version = ${fields.datasetVersion ?? null}
    WHERE id = ${id}`;
}

/** Human-readable summary printed at the end of every run (and appended to the cron log). */
export function formatRunSummary(command: string, status: RunStatus, report: RunReport, extra: Record<string, unknown> = {}): string {
  const lines = [
    `[ligapedia] ${command}: ${status}`,
    `  requests=${report.requests} changed=${report.changed} failed=${report.failed.length}`,
    ...Object.entries(extra).map(([k, v]) => `  ${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`),
  ];
  if (report.gateFailures.length) lines.push(`  sanity gates failed:`, ...report.gateFailures.map((f) => `    - ${f}`));
  if (report.unknownPhases.length)
    lines.push(`  unrecognized phases (add to data/overrides/phases.yaml):`, ...report.unknownPhases.map((p) => `    - ${p.season} ${p.torneo} / ${p.serie}`));
  if (report.newTeamNames.length) lines.push(`  new team names (check team-aliases.yaml):`, ...report.newTeamNames.map((n) => `    - ${n}`));
  if (report.unresolvedCards.length)
    lines.push(`  unresolved cards:`, ...report.unresolvedCards.map((c) => `    - match ${c.matchId} ${c.color === 'R' ? 'roja' : 'amarilla'}: ${c.name}`));
  if (report.inconsistentMatches.length) lines.push(`  inconsistent matches: ${report.inconsistentMatches.join(', ')}`);
  if (report.failed.length) lines.push(`  failed requests:`, ...report.failed.slice(0, 20).map((f) => `    - ${f.key}: ${f.reason}`));
  for (const n of report.notes) lines.push(`  note: ${n}`);
  return lines.join('\n');
}
