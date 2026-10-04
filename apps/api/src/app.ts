import rateLimit from '@fastify/rate-limit';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { Sql } from '@ligapedia/db';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerResponseCache } from './cache';
import type { ApiContext } from './context';
import { DatasetState } from './dataset';
import { NotFoundError } from './errors';
import { competitionRoutes } from './routes/competitions';
import { compareRoutes } from './routes/compare';
import { homeRoutes } from './routes/home';
import { matchRoutes } from './routes/matches';
import { metaRoutes } from './routes/meta';
import { playerRoutes } from './routes/players';
import { recordRoutes } from './routes/records';
import { searchRoutes } from './routes/search';
import { teamRoutes } from './routes/teams';

export interface AppOptions {
  sql: Sql;
  logger?: boolean | object;
  rateLimitPerMinute?: number;
  pollMs?: number;
}

export async function buildApp(options: AppOptions): Promise<{ app: FastifyInstance; ctx: ApiContext }> {
  const app = Fastify({
    logger: options.logger ?? false,
    trustProxy: true,
    disableRequestLogging: true,
    routerOptions: { ignoreTrailingSlash: true },
  }).withTypeProvider<TypeBoxTypeProvider>();

  const dataset = new DatasetState(options.sql);
  const ctx: ApiContext = { sql: options.sql, dataset, seasons: new Set() };
  const loadSeasons = async () => {
    try {
      const rows = await options.sql<{ year: number }[]>`SELECT year FROM core.seasons`;
      ctx.seasons = new Set(rows.map((r) => r.year));
    } catch {
      ctx.seasons = new Set(); // nothing published yet
    }
  };
  dataset.onChange(() => void loadSeasons());
  await dataset.start(options.pollMs);
  await loadSeasons();

  // Server-Timing: total handler time, for the speed budgets (specs/web-experience).
  app.addHook('onRequest', async (req) => {
    (req as unknown as { t0: bigint }).t0 = process.hrtime.bigint();
  });
  app.addHook('onSend', async (req, reply, payload) => {
    const t0 = (req as unknown as { t0?: bigint }).t0;
    if (t0) reply.header('server-timing', `app;dur=${(Number(process.hrtime.bigint() - t0) / 1e6).toFixed(2)}`);
    return payload;
  });

  await app.register(rateLimit, { max: options.rateLimitPerMinute ?? 600, timeWindow: '1 minute' });
  registerResponseCache(app, dataset);

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof NotFoundError) return reply.code(404).send({ error: 'not_found', message: err.message });
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) req.log.error(err);
    const message = err instanceof Error ? err.message : String(err);
    return reply.code(status).send({ error: status === 429 ? 'rate_limited' : 'error', message: status >= 500 ? 'Error interno' : message });
  });
  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: 'not_found', message: 'Recurso no encontrado' }));

  await metaRoutes(app, ctx);
  await homeRoutes(app, ctx);
  await competitionRoutes(app, ctx);
  await matchRoutes(app, ctx);
  await playerRoutes(app, ctx);
  await teamRoutes(app, ctx);
  await compareRoutes(app, ctx);
  await recordRoutes(app, ctx);
  await searchRoutes(app, ctx);

  app.addHook('onClose', async () => dataset.stop());
  return { app, ctx };
}
