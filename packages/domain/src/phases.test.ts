import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { classifyPhaseName, phaseDisplayName, resolvePhaseRole, tournamentName } from './phases';

interface Golden {
  season: number;
  torneo: string;
  serie: string;
  kind: string;
  roleHint: string | null;
}

const golden = JSON.parse(
  readFileSync(fileURLToPath(new URL('../test/fixtures/phase-names.golden.json', import.meta.url)), 'utf8'),
) as Golden[];

describe('phase name classification (golden: all observed series names 2006–2026)', () => {
  it('covers all 186 observed names', () => {
    expect(golden).toHaveLength(186);
  });

  it.each(golden.map((g) => [g.season + 1913, g.serie, g.kind, g.roleHint] as const))(
    '%i %s → %s / %s',
    (_year, serie, kind, roleHint) => {
      expect(classifyPhaseName(serie)).toEqual({ kind, roleHint });
    },
  );
});

describe('phase role resolution', () => {
  it('keeps third place and knockout hints', () => {
    expect(resolvePhaseRole('third_place', { teams: 2, pairs: 1 })).toBe('third_place');
    expect(resolvePhaseRole('knockout', { teams: 8, pairs: 4 })).toBe('knockout');
  });

  it('treats a round-robin named "Finales" as a league (2009 Finales Plata: 5 teams, 10 pairs)', () => {
    expect(resolvePhaseRole('final', { teams: 5, pairs: 10 })).toBe('league');
    expect(resolvePhaseRole('final', { teams: 4, pairs: 3 })).toBe('final');
  });

  it('decides unnamed phases by shape', () => {
    expect(resolvePhaseRole(null, { teams: 10, pairs: 44 })).toBe('league'); // 2006 Apertura, one match missing
    expect(resolvePhaseRole(null, { teams: 3, pairs: 3 })).toBe('league');
    expect(resolvePhaseRole(null, { teams: 4, pairs: 2 })).toBe('knockout'); // two-legged semis
    expect(resolvePhaseRole(null, { teams: 2, pairs: 1 })).toBe('final'); // e.g. "TORNEO UNIVERSITARIO"
  });
});

describe('display names', () => {
  it('names tournaments by kind', () => {
    expect(tournamentName('oro', ['COPA DE ORO', 'FINAL ORO'])).toBe('Copa de Oro');
    expect(tournamentName('oro', ['PLAY IN', 'FINAL PLAY OFF'])).toBe('Play-off');
    expect(tournamentName('anual', ['FINAL DEL UNIVERSITARIO'])).toBe('Universitario');
    expect(tournamentName('apertura', ['APERTURA'])).toBe('Apertura');
  });

  it('title-cases phase names', () => {
    expect(phaseDisplayName('FINAL DEL APERTURA')).toBe('Final del Apertura');
    expect(phaseDisplayName('Divisional " A "')).toBe('Divisional "A"');
    expect(phaseDisplayName('SEMI Y FINAL CO')).toBe('Semi y Final CO');
  });
});
