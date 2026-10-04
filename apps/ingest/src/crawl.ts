import {
  DETAIL_ACTIONS,
  normalizeName,
  req,
  seasonYearFromCode,
  SPORT_FUTSAL,
  type MatchListRow,
} from '@ligapedia/domain';
import type { ArchivingFetcher } from './source/fetcher';

export interface ListedMatch {
  seasonCode: number;
  torneo: string;
  serie: string;
  fecha: string;
  row: MatchListRow;
}

export interface SeasonListing {
  seasonCode: number;
  matches: ListedMatch[];
  series: Array<{ torneo: string; serie: string }>;
  /** False when any listing request failed (the season is incomplete). */
  complete: boolean;
}

/** Season codes whose sports list includes FUTSAL. */
export async function listSportSeasons(f: ArchivingFetcher, sport = SPORT_FUTSAL): Promise<number[]> {
  const seasons = (await f.get(req.seasons())) ?? [];
  const codes = seasons.map((s) => Number(s.codigo)).filter(Number.isFinite);
  const result: number[] = [];
  await Promise.all(
    codes.map(async (code) => {
      const sports = await f.get(req.sports(String(code)));
      if (sports?.some((s) => normalizeName(s.nombre) === normalizeName(sport))) result.push(code);
    }),
  );
  return result.sort((a, b) => a - b);
}

/** Crawl one season's listing tree: tournaments → series → rounds → matches, plus standings. */
export async function crawlSeason(f: ArchivingFetcher, seasonCode: number, sport = SPORT_FUTSAL): Promise<SeasonListing> {
  const t = String(seasonCode);
  let complete = true;
  const torneos = await f.get(req.tournaments(t, sport));
  if (!torneos) return { seasonCode, matches: [], series: [], complete: false };
  const matches: ListedMatch[] = [];
  const series: Array<{ torneo: string; serie: string }> = [];
  await Promise.all(
    torneos.map(async ({ nombre: torneo }) => {
      const list = await f.get(req.series(t, torneo, sport));
      if (!list) return void (complete = false);
      await Promise.all(
        list.map(async ({ nombre: serie }) => {
          series.push({ torneo, serie });
          const [rounds, standings] = await Promise.all([
            f.get(req.rounds(t, torneo, serie, sport)),
            f.get(req.standings(t, torneo, serie, sport)),
          ]);
          if (!rounds || !standings) complete = false;
          await Promise.all(
            (rounds ?? []).map(async ({ fecha }) => {
              const rows = await f.get(req.matches(t, torneo, serie, fecha, sport));
              if (!rows) return void (complete = false);
              for (const row of rows) matches.push({ seasonCode, torneo, serie, fecha, row });
            }),
          );
        }),
      );
    }),
  );
  return { seasonCode, matches, series, complete };
}

/** Fetch the 12 detail actions for each match (the client bounds concurrency). */
export async function crawlDetails(f: ArchivingFetcher, matchIds: string[], chunk = 100): Promise<void> {
  for (let i = 0; i < matchIds.length; i += chunk) {
    await Promise.all(
      matchIds.slice(i, i + chunk).flatMap((id) => DETAIL_ACTIONS.map((action) => f.get(req.detail(action, id)))),
    );
  }
}

export const seasonYear = seasonYearFromCode;
