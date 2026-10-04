import { describe, expect, it } from 'vitest';
import { parseFilters } from './filters';

const ctx = { seasons: new Set([2006, 2015, 2025]), orders: ['goles', 'partidos'] };
const all = ['temporada', 'desde', 'hasta', 'rama', 'tipo', 'torneo', 'equipo', 'top', 'min', 'orden', 'pagina'] as const;

describe('forgiving filter parsing', () => {
  it('parses valid Spanish filters', () => {
    const p = parseFilters({ rama: 'femenino', desde: '2014', hasta: '2019', top: '50', tipo: 'Copa de Oro', equipo: '12' }, all, ctx);
    expect(p.filters).toEqual({ rama: 'F', desde: 2014, hasta: 2019, top: 50, tipo: 'oro', equipo: 12 });
    expect([p.from, p.to]).toEqual([2014, 2019]);
    expect(p.ignored).toEqual([]);
  });

  it('ignores a season that does not exist (spec "Invalid season in URL")', () => {
    const p = parseFilters({ temporada: '1990' }, all, ctx);
    expect(p.filters.temporada).toBeUndefined();
    expect(p.ignored).toEqual(['temporada=1990']);
  });

  it('ignores invalid values without failing', () => {
    const p = parseFilters({ top: '7', min: '-3', rama: 'mixto', equipo: 'abc', orden: 'drop table', tipo: 'copa' }, all, ctx);
    expect(p.filters).toEqual({});
    expect(p.ignored).toHaveLength(6);
  });

  it('lets temporada win over a year range and swaps an inverted range', () => {
    expect(parseFilters({ temporada: '2015', desde: '2006' }, all, ctx)).toMatchObject({ from: 2015, to: 2015 });
    expect(parseFilters({ desde: '2020', hasta: '2010' }, all, ctx)).toMatchObject({ from: 2010, to: 2020 });
  });

  it('skips parameters the endpoint does not accept', () => {
    expect(parseFilters({ jugador: '5' }, all, ctx)).toEqual({ filters: {}, ignored: [], from: undefined, to: undefined });
  });
});
