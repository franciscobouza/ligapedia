import { describe, expect, it } from 'vitest';
import { parseSeasonText, seasonYearFromCode } from './seasons';

describe('season parsing', () => {
  it('derives the year from the code', () => {
    expect(seasonYearFromCode(93)).toBe(2006);
    expect(seasonYearFromCode(113)).toBe(2026);
  });

  it('reads the year from the published text', () => {
    expect(parseSeasonText('Año 2006', 93)).toEqual({ year: 2006, name: null });
    expect(parseSeasonText('AÑO 2019', 106)).toEqual({ year: 2019, name: null });
    expect(parseSeasonText('Temporada 110 "Año 2023"', 110)).toEqual({ year: 2023, name: null });
  });

  it('keeps a dedication and takes the year from the code', () => {
    expect(parseSeasonText('RAFAEL "CANARIO" GARCÍA', 113)).toEqual({ year: 2026, name: 'RAFAEL "CANARIO" GARCÍA' });
    expect(parseSeasonText(null, 100)).toEqual({ year: 2013, name: null });
    expect(parseSeasonText('Temporada 105', 105)).toEqual({ year: 2018, name: null });
  });
});
