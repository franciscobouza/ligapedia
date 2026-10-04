import type { Sql } from '@ligapedia/db';

/** Advisory lock key shared by every ingest command ("no concurrent runs"). */
export const INGEST_LOCK_KEY = 72_731_001;

export interface HeldLock {
  release(): Promise<void>;
}

/**
 * Try to take the session-level advisory lock on a dedicated connection.
 * Returns null when another command holds it.
 */
export async function tryLock(sql: Sql, key = INGEST_LOCK_KEY): Promise<HeldLock | null> {
  const conn = await sql.reserve();
  const [row] = await conn<{ ok: boolean }[]>`SELECT pg_try_advisory_lock(${key}) AS ok`;
  if (!row?.ok) {
    conn.release();
    return null;
  }
  return {
    async release() {
      await conn`SELECT pg_advisory_unlock(${key})`;
      conn.release();
    },
  };
}
