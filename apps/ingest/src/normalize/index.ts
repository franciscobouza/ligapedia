import type { Sql } from '@ligapedia/db';
import type { Overrides } from '@ligapedia/domain';
import { loadArchive } from '../archive';
import { buildCore, type ArchiveIndex, type CoreDraft } from './build';
import { assignIds, type IdMaps } from './ids';
import { loadCore } from './load';

export async function loadArchiveIndex(sql: Sql): Promise<ArchiveIndex> {
  const rows = await loadArchive(sql);
  return new Map(rows.map((r) => [r.key, { status: r.status, body: r.body }]));
}

export interface CoreBuildResult {
  draft: CoreDraft;
  ids: IdMaps;
}

/** Rebuild `schema` (default core_next) entirely from the raw archive (no network). */
export async function rebuildCore(sql: Sql, overrides: Overrides, schema = 'core_next'): Promise<CoreBuildResult> {
  const draft = buildCore(await loadArchiveIndex(sql), overrides);
  const ids = await assignIds(sql, draft);
  await loadCore(sql, schema, draft, ids);
  return { draft, ids };
}

export { buildCore } from './build';
export type { CoreDraft, CoreReport } from './build';
