import { describe, expect, it } from 'vitest';
import { normalizeName, playerDisplayName, searchForm, slugify, teamDisplayName } from './names';

describe('normalizeName', () => {
  it('trims, collapses whitespace and ignores case and accents', () => {
    expect(normalizeName('ARGOS ')).toBe('ARGOS');
    expect(normalizeName('Nautico Carrasco y Punta  Gorda')).toBe(normalizeName('NAUTICO CARRASCO Y PUNTA GORDA'));
    expect(normalizeName('Náutico')).toBe('NAUTICO');
    expect(normalizeName('NUESTRA SEÑORA DE LOURDES')).toBe('NUESTRA SENORA DE LOURDES');
    expect(normalizeName('SAN JOSE DE LA PROVIDENCIA uni')).toBe('SAN JOSE DE LA PROVIDENCIA UNI');
  });

  it('produces a lowercase search form and URL slugs', () => {
    expect(searchForm('HEBRAICA UNIVERSITARIO')).toBe('hebraica universitario');
    expect(slugify('NUESTRA SEÑORA DE LOURDES')).toBe('nuestra-senora-de-lourdes');
    expect(slugify('C.U.B.A.')).toBe('c-u-b-a');
  });
});

describe('display names', () => {
  it('title-cases players with Spanish particles lowercased', () => {
    expect(playerDisplayName('JUAN PABLO DE LOS SANTOS')).toBe('Juan Pablo de los Santos');
    expect(playerDisplayName('MATHIAS SOARES DE LIMA')).toBe('Mathias Soares de Lima');
    expect(playerDisplayName("DIEGO D'ALESSANDRO")).toBe("Diego D'Alessandro");
    expect(playerDisplayName('ÑANCAY BERNABE GRAÑA')).toBe('Ñancay Bernabe Graña');
  });

  it('keeps team acronyms and dotted acronyms in capitals', () => {
    expect(teamDisplayName('UNIVERSIDAD ORT')).toBe('Universidad ORT');
    expect(teamDisplayName('C.U.B.A.')).toBe('C.U.B.A.');
    expect(teamDisplayName('ARGOS ')).toBe('Argos');
    expect(teamDisplayName('SAN JOSE DE LA PROVIDENCIA uni')).toBe('San Jose de la Providencia Uni');
    expect(teamDisplayName('CLUB UGAB')).toBe('Club UGAB');
    expect(teamDisplayName('BOHEMIOS FS')).toBe('Bohemios FS');
    expect(teamDisplayName('NAUTICO CARRASCO Y PUNTA GORDA')).toBe('Nautico Carrasco y Punta Gorda');
    expect(teamDisplayName('LA 12 UNIVERSITARIA')).toBe('La 12 Universitaria');
  });
});
