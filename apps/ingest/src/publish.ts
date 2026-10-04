import { grantApiRead, type Sql } from '@ligapedia/db';
import type { CoreDraft } from './normalize/build';

export interface GateResult {
  ok: boolean;
  failures: string[];
}

async function schemaExists(sql: Sql, name: string): Promise<boolean> {
  const [row] = await sql`SELECT 1 AS ok FROM pg_namespace WHERE nspname = ${name}`;
  return Boolean(row);
}

/**
 * Refuse to publish a dataset that looks broken (design D4 step 3): the match count dropped by more
 * than 1%, a published season disappeared, a season has no phases, or a phase lists rounds without matches.
 */
export async function sanityGates(sql: Sql, draft: CoreDraft, current = 'core'): Promise<GateResult> {
  const failures: string[] = [];
  if (await schemaExists(sql, current)) {
    const [row] = await sql.unsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "${current}".matches`);
    const n = row?.n ?? 0;
    if (draft.matches.length < n * 0.99) {
      failures.push(`match count dropped from ${n} to ${draft.matches.length} (more than 1%)`);
    }
    const seasons = await sql.unsafe<{ year: number }[]>(`SELECT year FROM "${current}".seasons`);
    const next = new Set(draft.seasons.map((s) => s.year));
    for (const { year } of seasons) if (!next.has(year)) failures.push(`season ${year} disappeared`);
  }
  for (const s of draft.seasons) {
    if (!draft.phases.some((p) => p.seasonCode === s.code)) failures.push(`season ${s.year} has no phases`);
  }
  for (const p of draft.phases) {
    if (p.listedRounds > 0 && p.matchCount === 0) {
      failures.push(`phase "${p.serie}" (${p.seasonYear}) lists ${p.listedRounds} rounds but no matches`);
    }
  }
  return { ok: failures.length === 0, failures };
}

export interface PublishResult {
  version: number;
  publishedAt: Date;
}

/**
 * Atomically make core_next/stats_next the live dataset (design D4 step 4). The previous schemas are
 * kept as core_prev/stats_prev until the next publish, so `rollback` can swap them back.
 */
export async function publishNext(
  sql: Sql,
  meta: { runId: number | null; counts: Record<string, number> },
): Promise<PublishResult> {
  for (const s of ['core_next', 'stats_next']) {
    if (!(await schemaExists(sql, s))) throw new Error(`Cannot publish: schema ${s} does not exist`);
  }
  return sql.begin(async (tx) => {
    await grantApiRead(tx, ['core_next', 'stats_next']);
    await tx.unsafe('DROP SCHEMA IF EXISTS core_prev CASCADE');
    await tx.unsafe('DROP SCHEMA IF EXISTS stats_prev CASCADE');
    for (const base of ['core', 'stats']) {
      const [exists] = await tx`SELECT 1 AS ok FROM pg_namespace WHERE nspname = ${base}`;
      if (exists) await tx.unsafe(`ALTER SCHEMA "${base}" RENAME TO "${base}_prev"`);
      await tx.unsafe(`ALTER SCHEMA "${base}_next" RENAME TO "${base}"`);
    }
    const [row] = await tx<{ version: number; published_at: Date }[]>`
      UPDATE meta.dataset SET version = version + 1, published_at = now(), run_id = ${meta.runId}, counts = ${tx.json(meta.counts)}
      WHERE id = 1 RETURNING version, published_at`;
    await tx`SELECT pg_notify('dataset_published', ${String(row!.version)})`;
    return { version: row!.version, publishedAt: row!.published_at };
  });
}

/** Swap the live dataset with the previous one (and bump the version so caches invalidate). */
export async function rollback(sql: Sql, runId: number | null): Promise<PublishResult> {
  for (const s of ['core_prev', 'stats_prev', 'core', 'stats']) {
    if (!(await schemaExists(sql, s))) throw new Error(`Cannot roll back: schema ${s} does not exist`);
  }
  return sql.begin(async (tx) => {
    for (const base of ['core', 'stats']) {
      await tx.unsafe(`ALTER SCHEMA "${base}" RENAME TO "${base}_swap"`);
      await tx.unsafe(`ALTER SCHEMA "${base}_prev" RENAME TO "${base}"`);
      await tx.unsafe(`ALTER SCHEMA "${base}_swap" RENAME TO "${base}_prev"`);
    }
    const [row] = await tx<{ version: number; published_at: Date }[]>`
      UPDATE meta.dataset SET version = version + 1, published_at = now(), run_id = ${runId}
      WHERE id = 1 RETURNING version, published_at`;
    await tx`SELECT pg_notify('dataset_published', ${String(row!.version)})`;
    return { version: row!.version, publishedAt: row!.published_at };
  });
}
