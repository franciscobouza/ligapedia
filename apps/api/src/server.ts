/**
 * Production entry point. Serves the API and, when built, the website (apps/web/dist) on one port.
 *
 * Environment:
 *   DATABASE_URL                 one connection for everything (e.g. a Coolify-managed PostgreSQL), or
 *   DATABASE_URL_API / DATABASE_URL_INGEST   separate read-only and owner roles (Docker Compose setup)
 *   PORT (3000) · HOST (0.0.0.0) · LOG_LEVEL (info) · API_DB_POOL (16) · API_RATE_LIMIT_PER_MINUTE (600)
 *   WEB_DIST_DIR                 built SPA to serve (default: apps/web/dist when present; "off" to disable)
 *   RUN_MIGRATIONS               "false" to skip migrations at startup (default: run them)
 *   INGEST_SCHEDULER             "off" to disable the built-in 03:00 Montevideo refresh (default: on)
 *   AUTO_BACKFILL                "false" to not start the historical backfill on an empty database
 */
import { fileURLToPath } from 'node:url';
import { createSql, runMigrations } from '@ligapedia/db';
import { buildApp } from './app';
import { defaultCliPath, IngestScheduler } from './scheduler';

const apiUrl = process.env.DATABASE_URL_API ?? process.env.DATABASE_URL;
const ingestUrl = process.env.DATABASE_URL_INGEST ?? process.env.DATABASE_URL;
if (!apiUrl) {
  console.error('Missing environment variable DATABASE_URL (or DATABASE_URL_API)');
  process.exit(1);
}

if (ingestUrl && process.env.RUN_MIGRATIONS !== 'false') {
  await runMigrations(ingestUrl);
}

const sql = createSql(apiUrl, { max: Number(process.env.API_DB_POOL ?? 16), appName: 'ligapedia-api' });
const webDir =
  process.env.WEB_DIST_DIR === 'off'
    ? undefined
    : (process.env.WEB_DIST_DIR ?? fileURLToPath(new URL('../../web/dist', import.meta.url)));
const { app } = await buildApp({
  sql,
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
  rateLimitPerMinute: Number(process.env.API_RATE_LIMIT_PER_MINUTE ?? 600),
  webDir,
});
const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: process.env.HOST ?? '0.0.0.0' });

let scheduler: IngestScheduler | undefined;
const cliPath = defaultCliPath();
if (ingestUrl && cliPath && process.env.INGEST_SCHEDULER !== 'off') {
  scheduler = new IngestScheduler({ sql, ingestUrl, cliPath, log: app.log, autoBackfill: process.env.AUTO_BACKFILL !== 'false' });
  await scheduler.start();
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    scheduler?.stop();
    void app.close().then(() => sql.end({ timeout: 5 })).then(() => process.exit(0));
  });
}
