import { createSql } from '@ligapedia/db';
import { buildApp } from './app';

const url = process.env.DATABASE_URL_API;
if (!url) {
  console.error('Missing environment variable DATABASE_URL_API');
  process.exit(1);
}
const sql = createSql(url, { max: Number(process.env.API_DB_POOL ?? 16), appName: 'ligapedia-api' });
const { app } = await buildApp({
  sql,
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
  rateLimitPerMinute: Number(process.env.API_RATE_LIMIT_PER_MINUTE ?? 600),
});
const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: process.env.HOST ?? '0.0.0.0' });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void app.close().then(() => sql.end({ timeout: 5 })).then(() => process.exit(0));
  });
}
