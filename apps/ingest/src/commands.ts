import { runMigrations, type Sql } from '@ligapedia/db';
import { montevideoDate, type Overrides } from '@ligapedia/domain';
import { runBackfill } from './backfill';
import { crawlDetails, crawlSeason } from './crawl';
import { markVerified, runDailyFetch } from './daily';
import { tryLock } from './lock';
import { buildAndPublish, GateError } from './pipeline';
import { rollback } from './publish';
import { emptyReport, finishRun, formatRunSummary, startRun, type RunReport, type RunTrigger } from './runs';
import type { SourceClient } from './source/client';
import { ArchivingFetcher } from './source/fetcher';

export interface IngestContext {
  sql: Sql;
  databaseUrl: string;
  /** Created lazily: commands that never touch the network do not need it. */
  client: () => SourceClient;
  overrides: () => Overrides;
  now: () => Date;
  log: (line: string) => void;
  /** Maximum share of failed requests before a refresh aborts (default 0.2). */
  maxFailureRate?: number;
}

export interface CommandResult {
  status: 'succeeded' | 'failed' | 'skipped';
  exitCode: number;
  message: string;
  datasetVersion?: number;
}

const SKIP_RUNNING = 'skipped: running';
const SKIP_TODAY = 'skipped: already refreshed today';

class SkipError extends Error {}

/** Run a command under the shared advisory lock with run-history bookkeeping. */
async function withRun(
  ctx: IngestContext,
  command: string,
  trigger: RunTrigger,
  forced: boolean,
  body: (runId: number, report: RunReport) => Promise<{ datasetVersion?: number; counts?: Record<string, number>; extra?: Record<string, unknown> }>,
): Promise<CommandResult> {
  const lock = await tryLock(ctx.sql);
  if (!lock) {
    ctx.log(`[ligapedia] ${command}: ${SKIP_RUNNING}`);
    return { status: 'skipped', exitCode: 0, message: SKIP_RUNNING };
  }
  const report = emptyReport();
  const runId = await startRun(ctx.sql, command, trigger, forced, ctx.now());
  try {
    const out = await body(runId, report);
    await finishRun(ctx.sql, runId, { status: 'succeeded', report, counts: out.counts, datasetVersion: out.datasetVersion });
    ctx.log(formatRunSummary(command, 'succeeded', report, { datasetVersion: out.datasetVersion, ...out.extra }));
    return { status: 'succeeded', exitCode: 0, message: 'ok', datasetVersion: out.datasetVersion };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof SkipError) {
      await finishRun(ctx.sql, runId, { status: 'skipped', error: message });
      ctx.log(`[ligapedia] ${command}: ${message}`);
      return { status: 'skipped', exitCode: 0, message };
    }
    await finishRun(ctx.sql, runId, { status: 'failed', report, error: message });
    ctx.log(formatRunSummary(command, 'failed', report, { error: message }));
    return { status: 'failed', exitCode: 1, message };
  } finally {
    await lock.release();
  }
}

function checkFailures(ctx: IngestContext, f: ArchivingFetcher, report: RunReport): void {
  report.requests = f.stats.requests;
  report.changed = f.stats.changed;
  report.failed = f.stats.failed;
  const rate = f.failureRate();
  const max = ctx.maxFailureRate ?? 0.2;
  if (rate > max) {
    throw new Error(`${Math.round(rate * 100)}% of source requests failed (limit ${Math.round(max * 100)}%); nothing was published`);
  }
}

export async function migrateCommand(ctx: IngestContext): Promise<CommandResult> {
  await runMigrations(ctx.databaseUrl);
  ctx.log('[ligapedia] migrate: ok');
  return { status: 'succeeded', exitCode: 0, message: 'ok' };
}

export function backfillCommand(ctx: IngestContext, opts: { fromYear?: number; toYear?: number } = {}): Promise<CommandResult> {
  return withRun(ctx, 'backfill', 'manual', false, async (runId, report) => {
    const res = await runBackfill(ctx.sql, ctx.client(), { ...opts, log: ctx.log });
    checkFailures(ctx, res.fetcher, report);
    const pub = await buildAndPublish(ctx.sql, ctx.overrides(), runId, report);
    await markVerified(ctx.sql, res.seasons, ctx.now());
    return { datasetVersion: pub.version, counts: pub.counts, extra: { seasons: res.seasons.length, resumed: res.resumed } };
  });
}

export function seasonCommand(ctx: IngestContext, year: number): Promise<CommandResult> {
  return withRun(ctx, `season ${year}`, 'manual', false, async (runId, report) => {
    const f = new ArchivingFetcher(ctx.sql, ctx.client());
    const code = year - 1913;
    const listing = await crawlSeason(f, code);
    await crawlDetails(f, [...new Set(listing.matches.map((m) => m.row.ID))]);
    checkFailures(ctx, f, report);
    const pub = await buildAndPublish(ctx.sql, ctx.overrides(), runId, report);
    await markVerified(ctx.sql, [code], ctx.now());
    return { datasetVersion: pub.version, counts: pub.counts, extra: { matches: listing.matches.length } };
  });
}

/** Has a daily refresh already succeeded on this Montevideo calendar day? */
export async function refreshedToday(sql: Sql, now: Date): Promise<boolean> {
  const [row] = await sql`
    SELECT 1 AS ok FROM ops.ingest_runs
    WHERE command = 'daily' AND status = 'succeeded' AND montevideo_date = ${montevideoDate(now)} LIMIT 1`;
  return Boolean(row);
}

export async function dailyCommand(ctx: IngestContext, opts: { force?: boolean; scheduled?: boolean } = {}): Promise<CommandResult> {
  const now = ctx.now();
  const trigger: RunTrigger = opts.scheduled ? 'scheduled' : 'manual';
  if (!opts.force && (await refreshedToday(ctx.sql, now))) {
    const id = await startRun(ctx.sql, 'daily', trigger, false, now);
    await finishRun(ctx.sql, id, { status: 'skipped', error: SKIP_TODAY });
    ctx.log(`[ligapedia] daily: ${SKIP_TODAY}`);
    return { status: 'skipped', exitCode: 0, message: SKIP_TODAY };
  }
  return withRun(ctx, 'daily', trigger, Boolean(opts.force), async (runId, report) => {
    // Re-check under the lock: a concurrent run may have finished meanwhile.
    if (!opts.force && (await refreshedToday(ctx.sql, now))) throw new SkipError(SKIP_TODAY);
    const f = new ArchivingFetcher(ctx.sql, ctx.client());
    const plan = await runDailyFetch(ctx.sql, f, now);
    checkFailures(ctx, f, report);
    const pub = await buildAndPublish(ctx.sql, ctx.overrides(), runId, report);
    await markVerified(ctx.sql, [...plan.activeSeasons, ...(plan.rotationSeason !== null ? [plan.rotationSeason] : [])], now);
    return {
      datasetVersion: pub.version,
      counts: { ...pub.counts, detailMatches: plan.detailIds.length },
      extra: { active: plan.activeSeasons, rotation: plan.rotationSeason, newSeasons: plan.newSeasons, details: plan.detailIds.length },
    };
  });
}

export function rebuildCommand(ctx: IngestContext): Promise<CommandResult> {
  return withRun(ctx, 'rebuild', 'manual', false, async (runId, report) => {
    const pub = await buildAndPublish(ctx.sql, ctx.overrides(), runId, report);
    return { datasetVersion: pub.version, counts: pub.counts };
  });
}

export function rollbackCommand(ctx: IngestContext): Promise<CommandResult> {
  return withRun(ctx, 'rollback', 'manual', false, async (runId) => {
    const r = await rollback(ctx.sql, runId);
    return { datasetVersion: r.version };
  });
}

export { GateError };
