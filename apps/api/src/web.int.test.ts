import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSql } from '@ligapedia/db';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, one, type TestDb } from '../../../test/db';
import { buildApp } from './app';
import { createApiTestEnv, type ApiTestEnv } from '../test/env';

describe('single-process deployment: website served by the API', () => {
  let db: TestDb;
  let app: FastifyInstance;
  let close: () => Promise<void>;
  beforeAll(async () => {
    db = await createTestDb();
    const web = mkdtempSync(join(tmpdir(), 'lp-web-'));
    mkdirSync(join(web, 'assets'));
    writeFileSync(join(web, 'index.html'), '<!doctype html><title>Ligapedia</title>' + ' '.repeat(2000));
    writeFileSync(join(web, 'assets', 'index-abc123.js'), 'console.log(1);' + '/* x */'.repeat(500));
    const api = createSql(db.apiUrl, { max: 2 });
    ({ app } = await buildApp({ sql: api, webDir: web, pollMs: 60_000 }));
    close = async () => {
      await app.close();
      await api.end();
      await db.drop();
    };
  });
  afterAll(async () => close());

  it('serves index.html at / and as SPA fallback for app routes, revalidated, with security headers', async () => {
    for (const url of ['/', '/jugadores/12-juan', '/records/jugadores/goles?top=25']) {
      const res = await app.inject({ url, headers: { accept: 'text/html' } });
      expect(res.statusCode, url).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
      expect(res.headers['cache-control']).toBe('no-cache');
      expect(res.headers['content-security-policy']).toContain("script-src 'self'");
      expect(res.body).toContain('<title>Ligapedia</title>');
    }
  });

  it('serves hashed assets as immutable and compresses them', async () => {
    const res = await app.inject({ url: '/assets/index-abc123.js', headers: { 'accept-encoding': 'br, gzip' } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(res.headers['content-encoding']).toMatch(/br|gzip/);
  });

  it('keeps JSON 404s for unknown API paths', async () => {
    const res = await app.inject({ url: '/api/v1/nada' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: 'not_found' });
  });
});

describe('player titles follow the team title rule', () => {
  let env: ApiTestEnv;
  beforeAll(async () => {
    env = await createApiTestEnv();
  });
  afterAll(async () => env.close());

  it('does not count tournaments of kind "otro"', async () => {
    const t = one(await env.db.sql<{ id: number; team_id: number }[]>`
      SELECT c.tournament_id AS id, c.team_id FROM stats.champions c JOIN core.tournaments t ON t.id = c.tournament_id
      WHERE t.season_year = 2025 AND t.kind = 'apertura'`);
    const p = one(await env.db.sql<{ player_id: number }[]>`
      SELECT player_id FROM stats.player_agg WHERE tournament_id = ${t.id} AND team_id = ${t.team_id} LIMIT 1`);
    const titles = async () =>
      (await env.get<{ data: { titles: unknown[] } }>(`/api/v1/jugadores/${p.player_id}`)).body.data.titles.length;
    const before = await titles();
    expect(before).toBeGreaterThan(0);
    await env.db.sql`UPDATE stats.player_agg SET tournament_kind = 'otro' WHERE tournament_id = ${t.id}`;
    await env.db.sql`UPDATE meta.dataset SET version = version + 1`;
    await env.ctx.dataset.refresh();
    expect(await titles()).toBe(before - 1);
    const board = await env.get<{ data: { rows: Array<{ player: { id: number }; value: number }> } }>(
      `/api/v1/records/jugadores/titulos?top=100`,
    );
    expect(board.body.data.rows.find((r) => r.player.id === p.player_id)?.value ?? 0).toBe(before - 1);
  });
});
