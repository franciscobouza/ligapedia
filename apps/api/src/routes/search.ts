import { Envelope, SearchResults, type SearchResult } from '@ligapedia/contracts';
import { searchForm } from '@ligapedia/domain';
import type { FastifyInstance } from 'fastify';
import { filtersFrom, meta, type ApiContext } from '../context';

const PER_GROUP = 10;

export async function searchRoutes(app: FastifyInstance, ctx: ApiContext): Promise<void> {
  const { sql } = ctx;

  /**
   * Accent/case-insensitive search (design D11): every token must appear (any order); otherwise
   * fall back to trigram word similarity for misspellings. Name variants match; one row per entity.
   */
  app.get('/api/v1/buscar', { schema: { response: { 200: Envelope(SearchResults) } } }, async (req) => {
    const { filters, ignored } = filtersFrom(ctx, req, ['q']);
    const q = searchForm(filters.q ?? '').replace(/[%_\\]/g, ' ').replace(/\s+/g, ' ').trim();
    const empty = { query: q, players: [], teams: [], tournaments: [] };
    if (q.length < 2) return { data: empty, meta: meta(ctx, ignored) };
    const tokens = q.split(' ').filter(Boolean).slice(0, 6);
    const tokenMatch = tokens.reduce((acc, t) => sql`${acc} AND norm LIKE ${'%' + t + '%'}`, sql`TRUE`);
    const rows = await sql<(SearchResult & { rn: number })[]>`
      WITH hits AS (
        SELECT entity_type, entity_id, slug, label, matched_name, context, popularity,
               (${tokenMatch}) AS all_tokens,
               norm LIKE ${q + '%'} AS prefix,
               word_similarity(${q}, norm) AS sim
        FROM stats.search_index
        WHERE (${tokenMatch}) OR ${q} <% norm
      ), best AS (
        SELECT DISTINCT ON (entity_type, entity_id) *
        FROM hits ORDER BY entity_type, entity_id, all_tokens DESC, prefix DESC, sim DESC
      ), ranked AS (
        SELECT *, row_number() OVER (PARTITION BY entity_type
               ORDER BY all_tokens DESC, prefix DESC, sim DESC, popularity DESC, label) AS rn
        FROM best
      )
      SELECT entity_type AS type, entity_id AS id, slug, label, matched_name AS "matchedName", context, rn
      FROM ranked WHERE rn <= ${PER_GROUP} ORDER BY type, rn`;
    const pick = (type: SearchResult['type']) =>
      rows.filter((r) => r.type === type).map(({ rn: _rn, ...r }) => r);
    return { data: { query: q, players: pick('player'), teams: pick('team'), tournaments: pick('tournament') }, meta: meta(ctx, ignored) };
  });
}
