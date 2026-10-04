import type { Sql } from '@ligapedia/db';
import { montevideoDate, normalizeName, req, seasonYearFromCode, type MatchListRow } from '@ligapedia/domain';
import { crawlDetails, crawlSeason, type ListedMatch } from './crawl';
import type { ArchivingFetcher } from './source/fetcher';

export const RECENT_DAYS = 14;
export const ACTIVE_DAYS = 60;

export interface DailyPlan {
  activeSeasons: number[];
  rotationSeason: number | null;
  newSeasons: number[];
  detailIds: string[];
  reasons: Record<string, 'new' | 'changed' | 'recent' | 'rotation'>;
}

async function schemaExists(sql: Sql, name: string): Promise<boolean> {
  const [row] = await sql`SELECT 1 AS ok FROM pg_namespace WHERE nspname = ${name}`;
  return Boolean(row);
}

interface PublishedMatch {
  id: number;
  season_code: number;
  home_goals: number | null;
  away_goals: number | null;
  kickoff_local: string | null;
  venue: string | null;
  home: string;
  away: string;
}

/** Signature of the listing fields that matter (score, date, venue, teams) to detect changes. */
function listingSignature(row: { GL: string | null; GV: string | null; Fecha_Hora: string | null; Cancha: string | null; Locatario: string; Visitante: string }): string {
  const venue = normalizeName(row.Cancha ?? '');
  return [
    row.GL?.trim() || '',
    row.GV?.trim() || '',
    (row.Fecha_Hora ?? '').trim().slice(0, 16),
    venue === 'CANCHA A FIJAR' ? '' : venue,
    normalizeName(row.Locatario),
    normalizeName(row.Visitante),
  ].join('|');
}

function publishedSignature(m: PublishedMatch): string {
  return [
    m.home_goals ?? '',
    m.away_goals ?? '',
    (m.kickoff_local ?? '').slice(0, 16),
    normalizeName(m.venue ?? ''),
    normalizeName(m.home),
    normalizeName(m.away),
  ].join('|');
}

/**
 * Crawl what the daily refresh needs (spec daily-refresh "Incremental refresh scope") and return the plan.
 * Listing requests happen here; match details are fetched for the planned IDs.
 */
export async function runDailyFetch(sql: Sql, f: ArchivingFetcher, now: Date): Promise<DailyPlan> {
  const hasCore = await schemaExists(sql, 'core');
  const published = hasCore
    ? await sql<PublishedMatch[]>`
        SELECT m.id, m.season_code, m.home_goals, m.away_goals,
               to_char(m.kickoff AT TIME ZONE 'America/Montevideo', 'YYYY-MM-DD HH24:MI:SS') AS kickoff_local,
               v.name AS venue, h.name AS home, a.name AS away
        FROM core.matches m
        JOIN core.teams h ON h.id = m.home_team_id
        JOIN core.teams a ON a.id = m.away_team_id
        LEFT JOIN core.venues v ON v.id = m.venue_id`
    : [];
  const knownSeasons = hasCore ? (await sql<{ code: number }[]>`SELECT code FROM core.seasons`).map((r) => r.code) : [];
  const byId = new Map(published.map((m) => [m.id, m]));

  // Seasons: only codes we do not know yet need a sports check (new-season detection).
  const listedCodes = ((await f.get(req.seasons())) ?? []).map((s) => Number(s.codigo)).filter(Number.isFinite);
  const unknownCodes = listedCodes.filter((c) => !knownSeasons.includes(c));
  const newSeasons: number[] = [];
  for (const code of unknownCodes) {
    const sports = await f.get(req.sports(String(code)));
    if (sports?.some((s) => normalizeName(s.nombre) === 'FUTSAL')) newSeasons.push(code);
  }
  const futsalSeasons = [...new Set([...knownSeasons.filter((c) => listedCodes.includes(c)), ...newSeasons])].sort((a, b) => a - b);

  // Active: newest season + seasons with matches in the last 60 days or in the future.
  const today = montevideoDate(now);
  const daysAgo = (n: number) => montevideoDate(new Date(now.getTime() - n * 86_400_000));
  const activeCutoff = daysAgo(ACTIVE_DAYS);
  const recentCutoff = daysAgo(RECENT_DAYS);
  const active = new Set<number>(newSeasons);
  if (futsalSeasons.length) active.add(futsalSeasons.at(-1)!);
  for (const m of published) if (m.kickoff_local && m.kickoff_local.slice(0, 10) >= activeCutoff) active.add(m.season_code);

  const reasons: DailyPlan['reasons'] = {};
  const detailIds = new Set<string>();
  const consider = (lm: { row: MatchListRow }) => {
    const id = lm.row.ID;
    const prev = byId.get(Number(id));
    const day = (lm.row.Fecha_Hora ?? '').slice(0, 10);
    if (!prev) reasons[id] = 'new';
    else if (publishedSignature(prev) !== listingSignature(lm.row)) reasons[id] = 'changed';
    else if (day >= recentCutoff && day <= today) reasons[id] = 'recent';
    else return;
    detailIds.add(id);
  };
  const activeSeasons = [...active].sort((a, b) => a - b);
  const listings: ListedMatch[] = [];
  for (const code of activeSeasons) {
    const listing = await crawlSeason(f, code);
    listings.push(...listing.matches);
  }
  listings.forEach(consider);

  // Rotation: the least recently verified historical season, re-verified in full.
  const verified = new Map(
    (await sql<{ season_code: number; verified_at: Date }[]>`SELECT season_code, verified_at FROM ops.season_verification`).map((r) => [
      r.season_code,
      r.verified_at.getTime(),
    ]),
  );
  const historical = futsalSeasons.filter((c) => !active.has(c));
  const rotationSeason = historical.sort((a, b) => (verified.get(a) ?? 0) - (verified.get(b) ?? 0) || a - b)[0] ?? null;
  if (rotationSeason !== null) {
    const listing = await crawlSeason(f, rotationSeason);
    for (const lm of listing.matches) {
      detailIds.add(lm.row.ID);
      reasons[lm.row.ID] ??= 'rotation';
    }
  }

  await crawlDetails(f, [...detailIds]);
  return { activeSeasons, rotationSeason, newSeasons, detailIds: [...detailIds], reasons };
}

export async function markVerified(sql: Sql, seasonCodes: number[], at: Date): Promise<void> {
  for (const code of seasonCodes) {
    await sql`
      INSERT INTO ops.season_verification (season_code, verified_at) VALUES (${code}, ${at})
      ON CONFLICT (season_code) DO UPDATE SET verified_at = EXCLUDED.verified_at`;
  }
}

export const yearOf = seasonYearFromCode;
