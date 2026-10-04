import { describe, expect, it } from 'vitest';
import { idFrom, parseSearch } from './search-params';

describe('URL search params', () => {
  it('keeps valid filters and drops invalid ones', () => {
    expect(parseSearch({ temporada: '2025', rama: 'femenino', top: 50, tipo: 'oro', equipo: 'abc', orden: 'DROP;' })).toEqual({
      temporada: 2025,
      rama: 'femenino',
      top: 50,
      tipo: 'oro',
    });
  });

  it('extracts the id from an entity param', () => {
    expect(idFrom('123-juan-perez')).toBe(123);
    expect(idFrom('123')).toBe(123);
    expect(idFrom('abc')).toBeNaN();
  });
});
