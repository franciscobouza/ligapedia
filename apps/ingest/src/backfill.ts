import type { Sql } from '@ligapedia/db';
import { seasonYearFromCode } from '@ligapedia/domain';
import { keysFetchedSince } from './archive';
import { crawlDetails, crawlSeason, listSportSeasons } from './crawl';
import { ArchivingFetcher } from './source/fetcher';
import type { SourceClient } from './source/client';

interface BackfillMarker {
  startedAt: string;
  completedAt?: string;
}

export interface BackfillOptions {
  fromYear?: number;
  toYear?: number;
  /** Test hook, see FetcherOptions.stopAfter. */
  stopAfter?: number;
  log?: (line: string) => void;
}

export interface BackfillResult {
  seasons: number[];
  matches: number;
  resumed: boolean;
  fetcher: ArchivingFetcher;
}

async function readMarker(sql: Sql): Promise<BackfillMarker | undefined> {
  const [row] = await sql<{ value: BackfillMarker }[]>`SELECT value FROM ops.state WHERE key = 'backfill'`;
  return row?.value;
}

async function writeMarker(sql: Sql, marker: BackfillMarker): Promise<void> {
  await sql`
    INSERT INTO ops.state (key, value) VALUES ('backfill', ${sql.json(marker as never)})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
}

/**
 * Full historical crawl into the raw archive (spec "Resumable full backfill"). An unfinished
 * backfill leaves its start marker in ops.state; the next run reuses every response archived since.
 */
export async function runBackfill(sql: Sql, client: SourceClient, options: BackfillOptions = {}): Promise<BackfillResult> {
  const previous = await readMarker(sql);
  const resumed = Boolean(previous && !previous.completedAt);
  const marker: BackfillMarker = resumed ? previous! : { startedAt: new Date().toISOString() };
  if (!resumed) await writeMarker(sql, marker);
  const reuseKeys = resumed ? await keysFetchedSince(sql, new Date(marker.startedAt)) : new Set<string>();
  const log = options.log;
  const fetcher = new ArchivingFetcher(sql, client, {
    reuseKeys,
    stopAfter: options.stopAfter,
    onProgress: log
      ? (s) => log(`[ligapedia] backfill progress: completed=${fetcher.completed} reused=${s.reused} new=${s.inserted} failed=${s.failed.length}`)
      : undefined,
  });

  const seasons = (await listSportSeasons(fetcher)).filter((code) => {
    const y = seasonYearFromCode(code);
    return (options.fromYear === undefined || y >= options.fromYear) && (options.toYear === undefined || y <= options.toYear);
  });
  let matches = 0;
  log?.(`[ligapedia] backfill: ${seasons.length} seasons${resumed ? ` (resuming from ${marker.startedAt}, ${reuseKeys.size} archived)` : ''}`);
  for (const code of seasons) {
    const listing = await crawlSeason(fetcher, code);
    const ids = [...new Set(listing.matches.map((m) => m.row.ID))];
    matches += ids.length;
    log?.(`[ligapedia] backfill: season ${seasonYearFromCode(code)} — ${ids.length} matches`);
    await crawlDetails(fetcher, ids);
  }
  await writeMarker(sql, { ...marker, completedAt: new Date().toISOString() });
  return { seasons, matches, resumed, fetcher };
}
