import { existsSync } from 'node:fs';
import { join } from 'node:path';
import compress from '@fastify/compress';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { Sql } from '@ligapedia/db';
import Fastify, { LogController, type FastifyInstance } from 'fastify';
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
  /** Built SPA (apps/web/dist) to serve on the same port; omit to serve the API only. */
  webDir?: string;
}

/** Security headers for HTML/static responses (Caddy sets them in the Compose deployment). */
const SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'content-security-policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
};

export async function buildApp(options: AppOptions): Promise<{ app: FastifyInstance; ctx: ApiContext }> {
  const app = Fastify({
    logger: options.logger ?? false,
    trustProxy: true,
    logController: new LogController({ disableRequestLogging: true }),
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

  await app.register(rateLimit, {
    max: options.rateLimitPerMinute ?? 600,
    timeWindow: '1 minute',
    allowList: (req) => !req.url.startsWith('/api/'), // static files are not rate limited
  });
  registerResponseCache(app, dataset);
  // Registered after the response cache so the cache stores uncompressed bodies.
  await app.register(compress, { global: true, encodings: ['br', 'gzip'], brotliOptions: { params: { 1: 4 } }, threshold: 1024 });

  const webDir = options.webDir && existsSync(join(options.webDir, 'index.html')) ? options.webDir : undefined;
  if (webDir) {
    await app.register(fastifyStatic, {
      root: webDir,
      wildcard: false,
      index: false,
      // Hashed assets are immutable; everything else (index.html, boot.js, favicon) must revalidate.
      setHeaders: (res, filePath) => {
        res.header('cache-control', filePath.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
        for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.header(k, v);
      },
    });
  }

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof NotFoundError) return reply.code(404).send({ error: 'not_found', message: err.message });
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) req.log.error(err);
    const message = err instanceof Error ? err.message : String(err);
    return reply.code(status).send({ error: status === 429 ? 'rate_limited' : 'error', message: status >= 500 ? 'Error interno' : message });
  });
  app.setNotFoundHandler((req, reply) => {
    // SPA fallback: every non-API GET path renders the app, which shows its own 404 page.
    if (webDir && (req.method === 'GET' || req.method === 'HEAD') && !req.url.startsWith('/api/')) {
      for (const [k, v] of Object.entries(SECURITY_HEADERS)) reply.header(k, v);
      return reply.header('cache-control', 'no-cache').type('text/html; charset=utf-8').sendFile('index.html');
    }
    return reply.code(404).send({ error: 'not_found', message: 'Recurso no encontrado' });
  });

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
