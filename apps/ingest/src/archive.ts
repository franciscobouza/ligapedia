import { createHash } from 'node:crypto';
import type { Sql } from '@ligapedia/db';
import { requestKey, type SourceRequest } from '@ligapedia/domain';

export interface ArchivedResponse {
  key: string;
  endpoint: string;
  action: string;
  params: Record<string, string>;
  status: number;
  body: string;
  contentHash: string;
  fetchedAt: Date;
  changedAt: Date;
}

export const contentHash = (body: string): string => createHash('sha256').update(body).digest('hex');

export interface UpsertResult {
  inserted: boolean;
  changed: boolean;
}

/**
 * Archive a successfully interpreted response verbatim. `changed_at` only moves when the body's
 * hash differs, so unchanged re-fetches are cheap to detect. Failed fetches are never archived,
 * so a transient error can never overwrite good data.
 */
export async function archiveResponse(sql: Sql, req: SourceRequest, status: number, body: string): Promise<UpsertResult> {
  const key = requestKey(req);
  const hash = contentHash(body);
  const [row] = await sql<{ inserted: boolean; changed: boolean }[]>`
    WITH prev AS (SELECT content_hash FROM raw.responses WHERE key = ${key})
    INSERT INTO raw.responses AS r (key, endpoint, action, params, status, body, content_hash)
    VALUES (${key}, ${req.endpoint}, ${req.action}, ${sql.json(req.params)}, ${status}, ${body}, ${hash})
    ON CONFLICT (key) DO UPDATE SET
      status = EXCLUDED.status,
      body = EXCLUDED.body,
      content_hash = EXCLUDED.content_hash,
      fetched_at = now(),
      changed_at = CASE WHEN r.content_hash IS DISTINCT FROM EXCLUDED.content_hash THEN now() ELSE r.changed_at END
    RETURNING
      (SELECT content_hash FROM prev) IS NULL AS inserted,
      (SELECT content_hash FROM prev) IS DISTINCT FROM ${hash} AS changed`;
  return { inserted: row!.inserted, changed: row!.changed };
}

export async function getArchived(sql: Sql, key: string): Promise<ArchivedResponse | undefined> {
  const [row] = await sql<ArchivedResponse[]>`
    SELECT key, endpoint, action, params, status, body, content_hash AS "contentHash",
           fetched_at AS "fetchedAt", changed_at AS "changedAt"
    FROM raw.responses WHERE key = ${key}`;
  return row;
}

/** Keys archived (fetched) at or after `since` — used to resume an interrupted backfill. */
export async function keysFetchedSince(sql: Sql, since: Date): Promise<Set<string>> {
  const rows = await sql<{ key: string }[]>`SELECT key FROM raw.responses WHERE fetched_at >= ${since}`;
  return new Set(rows.map((r) => r.key));
}

/** Stream every archived response (normalization input). */
export async function loadArchive(sql: Sql): Promise<ArchivedResponse[]> {
  return sql<ArchivedResponse[]>`
    SELECT key, endpoint, action, params, status, body, content_hash AS "contentHash",
           fetched_at AS "fetchedAt", changed_at AS "changedAt"
    FROM raw.responses`;
}
