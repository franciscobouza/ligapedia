import { normalizeName } from './names';

/** FUTSAL season codes map to calendar years with a fixed offset (93 → 2006, 113 → 2026). */
export const SEASON_CODE_YEAR_OFFSET = 1913;

export function seasonYearFromCode(code: number): number {
  return code + SEASON_CODE_YEAR_OFFSET;
}

export interface SeasonInfo {
  year: number;
  /** Dedication text published instead of the year (e.g. `RAFAEL "CANARIO" GARCÍA`), if any. */
  name: string | null;
}

/**
 * Interpret the `temporada` text of the match details:
 *   "Año 2006", "AÑO 2019", `Temporada 110 "Año 2023"` → the year;
 *   anything else that is not a bare "Temporada N" label → a dedication, year from the code.
 */
export function parseSeasonText(text: string | null | undefined, code: number): SeasonInfo {
  const raw = (text ?? '').trim();
  const match = /\bANO\s+(\d{4})\b/.exec(normalizeName(raw));
  if (match) return { year: Number(match[1]), name: null };
  const isLabel = raw === '' || /^TEMPORADA\s+\d+$/.test(normalizeName(raw));
  return { year: seasonYearFromCode(code), name: isLabel ? null : raw };
}
