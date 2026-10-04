import type { Sql } from '@ligapedia/db';
import type { FastifyRequest } from 'fastify';
import type { DatasetState } from './dataset';
import { parseFilters, type FilterName, type ParsedFilters } from './filters';

export interface ApiContext {
  sql: Sql;
  dataset: DatasetState;
  /** Season years of the published dataset (refreshed on every publish). */
  seasons: Set<number>;
}

export function filtersFrom(
  ctx: ApiContext,
  req: FastifyRequest,
  allowed: readonly FilterName[],
  orders?: readonly string[],
): ParsedFilters {
  return parseFilters((req.query ?? {}) as Record<string, unknown>, allowed, { seasons: ctx.seasons, orders });
}

export function meta(ctx: ApiContext, ignored: string[] = []) {
  return { datasetVersion: ctx.dataset.current.version, ignoredFilters: ignored };
}

/** Numeric id from a route param such as "123" or "123-some-slug"; NaN when invalid. */
export function idParam(raw: string): number {
  const m = /^(\d{1,9})(?:-|$)/.exec(raw);
  return m ? Number(m[1]) : Number.NaN;
}
