import { createSql, type Sql } from '@ligapedia/db';
import { emptyOverrides } from '@ligapedia/domain';
import type { FastifyInstance } from 'fastify';
import { createTestDb, type TestDb } from '../../../test/db';
import { seedArchiveFromFixtures } from '../../ingest/test/mock-source';
import { buildAndPublish } from '../../ingest/src/pipeline';
import { emptyReport } from '../../ingest/src/runs';
import { buildApp } from '../src/app';
import type { ApiContext } from '../src/context';

export interface ApiTestEnv {
  db: TestDb;
  api: Sql;
  app: FastifyInstance;
  ctx: ApiContext;
  get<T = unknown>(url: string, headers?: Record<string, string>): Promise<{ status: number; body: T; headers: Record<string, unknown> }>;
  close(): Promise<void>;
}

/** Real fixtures (2025 Apertura + quirk matches) published by the real pipeline, served via the API role. */
export async function createApiTestEnv(): Promise<ApiTestEnv> {
  const db = await createTestDb();
  await seedArchiveFromFixtures(db.sql);
  await buildAndPublish(db.sql, emptyOverrides(), null, emptyReport());
  const api = createSql(db.apiUrl, { max: 4 });
  const { app, ctx } = await buildApp({ sql: api, rateLimitPerMinute: 100_000, pollMs: 60_000 });
  return {
    db,
    api,
    app,
    ctx,
    async get(url, headers = {}) {
      const res = await app.inject({ method: 'GET', url, headers });
      return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null, headers: res.headers };
    },
    async close() {
      await app.close();
      await api.end();
      await db.drop();
    },
  };
}
