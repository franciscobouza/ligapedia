import { Envelope, Health, SiteMeta } from '@ligapedia/contracts';
import { KIND_LABELS, TOURNAMENT_KINDS } from '@ligapedia/domain';
import type { FastifyInstance } from 'fastify';
import { meta, type ApiContext } from '../context';
import { coverageFor } from '../queries/common';

export async function metaRoutes(app: FastifyInstance, ctx: ApiContext): Promise<void> {
  const { sql } = ctx;

  app.get('/api/health', { schema: { response: { 200: Health, 503: Health } } }, async (_req, reply) => {
    try {
      const info = await ctx.dataset.refresh();
      const age = info.publishedAt ? (Date.now() - info.publishedAt.getTime()) / 3_600_000 : null;
      return {
        status: 'ok' as const,
        db: 'ok' as const,
        datasetVersion: info.version,
        publishedAt: info.publishedAt?.toISOString() ?? null,
        refreshAgeHours: age === null ? null : Math.round(age * 10) / 10,
      };
    } catch {
      return reply.code(503).send({ status: 'degraded', db: 'error', datasetVersion: null, publishedAt: null, refreshAgeHours: null });
    }
  });

  app.get('/api/v1/meta', { schema: { response: { 200: Envelope(SiteMeta) } } }, async () => {
    const seasons = await sql<{ year: number; name: string | null; categories: ('M' | 'F')[] }[]>`
      SELECT s.year, s.name, coalesce(array_agg(DISTINCT t.category ORDER BY t.category DESC) FILTER (WHERE t.id IS NOT NULL), '{}') AS categories
      FROM core.seasons s LEFT JOIN core.tournaments t ON t.season_code = s.code
      GROUP BY s.year, s.name ORDER BY s.year DESC`;
    const coverage = await coverageFor(sql, sql`TRUE`);
    return {
      data: {
        datasetVersion: ctx.dataset.current.version,
        publishedAt: ctx.dataset.current.publishedAt?.toISOString() ?? null,
        seasons: seasons.map((s) => ({ year: s.year, name: s.name, categories: s.categories })),
        kinds: TOURNAMENT_KINDS.map((k) => ({ kind: k, label: KIND_LABELS[k] })),
        coverage,
      },
      meta: meta(ctx),
    };
  });
}
