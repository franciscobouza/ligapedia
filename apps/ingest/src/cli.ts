#!/usr/bin/env node
/**
 * Ligapedia ingest CLI (design D8).
 *   migrate                         apply database migrations
 *   backfill [--from Y] [--to Y]    full historical crawl (resumable), then publish
 *   season <year>                   re-crawl one season, then publish
 *   daily [--force] [--scheduled]   the 03:00 refresh (at most once per Montevideo day)
 *   rebuild                         re-normalize + rebuild statistics from the archive (no network)
 *   rollback                        swap the live dataset with the previous one
 */
import { parseArgs } from 'node:util';
import { createSql } from '@ligapedia/db';
import {
  backfillCommand,
  dailyCommand,
  migrateCommand,
  rebuildCommand,
  rollbackCommand,
  seasonCommand,
  type CommandResult,
  type IngestContext,
} from './commands';
import { readOverrides } from './overrides';
import { SourceClient, userAgent } from './source/client';

const VERSION = '0.1.0';

function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') throw new Error(`Missing environment variable ${name}`);
  return v;
}

async function main(argv: string[]): Promise<number> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      force: { type: 'boolean', default: false },
      scheduled: { type: 'boolean', default: false },
      from: { type: 'string' },
      to: { type: 'string' },
    },
  });
  const [command, arg] = positionals;
  const databaseUrl = env('DATABASE_URL_INGEST');
  const sql = createSql(databaseUrl, { max: 8, appName: 'ligapedia-ingest' });
  const domain = process.env.LIGAPEDIA_DOMAIN;
  const ctx: IngestContext = {
    sql,
    databaseUrl,
    client: () =>
      new SourceClient({
        concurrency: Number(process.env.INGEST_CONCURRENCY ?? 4),
        userAgent: userAgent(VERSION, domain ? `https://${domain}` : undefined, process.env.LIGAPEDIA_CONTACT),
      }),
    overrides: () => readOverrides(),
    now: () => new Date(),
    log: (line) => console.log(line),
  };
  let result: CommandResult;
  try {
    switch (command) {
      case 'migrate':
        result = await migrateCommand(ctx);
        break;
      case 'backfill':
        result = await backfillCommand(ctx, {
          fromYear: values.from ? Number(values.from) : undefined,
          toYear: values.to ? Number(values.to) : undefined,
        });
        break;
      case 'season':
        if (!arg || !/^\d{4}$/.test(arg)) throw new Error('Usage: season <year>');
        result = await seasonCommand(ctx, Number(arg));
        break;
      case 'daily':
        result = await dailyCommand(ctx, { force: values.force, scheduled: values.scheduled });
        break;
      case 'rebuild':
        result = await rebuildCommand(ctx);
        break;
      case 'rollback':
        result = await rollbackCommand(ctx);
        break;
      default:
        console.error('Usage: ligapedia-ingest <migrate|backfill|season <year>|daily|rebuild|rollback> [--force] [--scheduled]');
        return 2;
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
  if (result.exitCode !== 0) console.error(`[ligapedia] ${command} failed: ${result.message}`);
  return result.exitCode;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    console.error(`[ligapedia] fatal: ${err instanceof Error ? err.stack : String(err)}`);
    process.exit(1);
  },
);
