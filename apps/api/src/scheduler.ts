import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Sql } from '@ligapedia/db';
import { montevideoDate, montevideoToUtc } from '@ligapedia/domain';

/** The daily refresh runs at 03:00 America/Montevideo (specs/daily-refresh). */
export const REFRESH_LOCAL_TIME = '03:00';

/** Next 03:00 Montevideo strictly after `now`. */
export function nextRunAt(now: Date, localTime = REFRESH_LOCAL_TIME): Date {
  const today = montevideoToUtc(`${montevideoDate(now)} ${localTime}`)!;
  if (today.getTime() > now.getTime()) return today;
  const tomorrow = montevideoDate(new Date(today.getTime() + 26 * 3_600_000));
  return montevideoToUtc(`${tomorrow} ${localTime}`)!;
}

export function defaultCliPath(): string | undefined {
  const candidates = [
    fileURLToPath(new URL('../../ingest/dist/cli.js', import.meta.url)), // apps/api/{dist,src} → apps/ingest/dist
  ];
  return candidates.find((p) => existsSync(p));
}

interface Logger {
  info(msg: string): void;
  error(msg: string): void;
}

export interface SchedulerOptions {
  sql: Sql;
  ingestUrl: string;
  cliPath: string;
  log: Logger;
  /** Start a backfill when nothing has been published yet (default true). */
  autoBackfill?: boolean;
}

/**
 * In-process scheduler for single-container deployments (e.g. Coolify + Railpack), where there is no host
 * cron. It spawns the ingest CLI as a child process so a long crawl never blocks the API. The CLI's
 * advisory lock and once-per-Montevideo-day guard make overlapping or repeated triggers harmless.
 */
export class IngestScheduler {
  private timer?: NodeJS.Timeout;
  private readonly running = new Set<ChildProcess>();

  constructor(private readonly opts: SchedulerOptions) {}

  run(args: string[]): Promise<number> {
    const { cliPath, ingestUrl, log } = this.opts;
    return new Promise((resolve) => {
      const child = spawn(process.execPath, [cliPath, ...args], {
        env: { ...process.env, DATABASE_URL_INGEST: ingestUrl },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.running.add(child);
      const relay = (stream: NodeJS.ReadableStream | null, error: boolean) => {
        let buffer = '';
        stream?.setEncoding('utf8');
        stream?.on('data', (chunk: string) => {
          buffer += chunk;
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) if (line.trim()) (error ? log.error : log.info).call(log, `[ingest ${args[0]}] ${line}`);
        });
      };
      relay(child.stdout, false);
      relay(child.stderr, true);
      child.on('exit', (code) => {
        this.running.delete(child);
        log.info(`[ingest ${args[0]}] exited with code ${code}`);
        resolve(code ?? 1);
      });
    });
  }

  private scheduleNext(): void {
    const at = nextRunAt(new Date());
    this.opts.log.info(`daily refresh scheduled for ${at.toISOString()} (03:00 America/Montevideo)`);
    this.timer = setTimeout(() => {
      void this.run(['daily', '--scheduled']).finally(() => this.scheduleNext());
    }, at.getTime() - Date.now());
    this.timer.unref();
  }

  async start(): Promise<void> {
    if (this.opts.autoBackfill !== false) {
      const [row] = await this.opts.sql<{ version: number }[]>`SELECT version FROM meta.dataset WHERE id = 1`;
      if ((row?.version ?? 0) === 0) {
        this.opts.log.info('no dataset published yet: starting the historical backfill in the background (resumable)');
        void this.run(['backfill']);
      }
    }
    this.scheduleNext();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    for (const child of this.running) child.kill('SIGTERM');
  }
}
