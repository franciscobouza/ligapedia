import { req } from '@ligapedia/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../../test/db';
import { archiveResponse, getArchived, keysFetchedSince } from './archive';

describe('raw archive', () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
  });
  afterAll(async () => db.drop());

  const r = req.detail('GolesLocatario', '92923');

  it('inserts a new response verbatim with its hash', async () => {
    expect(await archiveResponse(db.sql, r, 200, '[{"a":1}]')).toEqual({ inserted: true, changed: true });
    const row = await getArchived(db.sql, 'detallefechas:GolesLocatario?id=92923');
    expect(row).toMatchObject({ status: 200, body: '[{"a":1}]', action: 'GolesLocatario', params: { id: '92923' } });
    expect(row?.contentHash).toHaveLength(64);
  });

  it('leaves changed_at untouched for an identical re-fetch', async () => {
    const before = await getArchived(db.sql, 'detallefechas:GolesLocatario?id=92923');
    await new Promise((ok) => setTimeout(ok, 20));
    expect(await archiveResponse(db.sql, r, 200, '[{"a":1}]')).toEqual({ inserted: false, changed: false });
    const after = await getArchived(db.sql, 'detallefechas:GolesLocatario?id=92923');
    expect(after!.changedAt.getTime()).toBe(before!.changedAt.getTime());
    expect(after!.fetchedAt.getTime()).toBeGreaterThan(before!.fetchedAt.getTime());
  });

  it('moves changed_at when the body changes', async () => {
    const before = await getArchived(db.sql, 'detallefechas:GolesLocatario?id=92923');
    await new Promise((ok) => setTimeout(ok, 20));
    expect(await archiveResponse(db.sql, r, 200, '[{"a":2}]')).toEqual({ inserted: false, changed: true });
    const after = await getArchived(db.sql, 'detallefechas:GolesLocatario?id=92923');
    expect(after!.changedAt.getTime()).toBeGreaterThan(before!.changedAt.getTime());
    expect(after!.body).toBe('[{"a":2}]');
  });

  it('lists keys fetched since a marker', async () => {
    const marker = new Date();
    await new Promise((ok) => setTimeout(ok, 10));
    await archiveResponse(db.sql, req.detail('GolesVisitante', '92923'), 200, '[]');
    expect([...(await keysFetchedSince(db.sql, marker))]).toEqual(['detallefechas:GolesVisitante?id=92923']);
  });
});
