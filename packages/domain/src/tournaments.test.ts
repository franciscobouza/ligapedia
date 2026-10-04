import { describe, expect, it } from 'vitest';
import { createTeamResolver } from './teams';
import { groupPhases, type PhaseInput } from './tournaments';

const phase = (serie: string, teams: number, pairs: number, startDate: string, torneo: string = 'FUTSAL'): PhaseInput => ({
  torneo,
  serie,
  shape: { teams, pairs },
  startDate,
  endDate: startDate,
});

describe('tournament grouping', () => {
  it('groups the 2025 Apertura phases into one tournament with a final', () => {
    const t = groupPhases('FUTSAL', 112, 'M', [
      phase('APERTURA', 6, 15, '2025-05-14'),
      phase('APERTURA SERIE 1', 3, 3, '2025-06-25'),
      phase('APERTURA - SERIE 2', 3, 3, '2025-06-25'),
      phase('FINAL DEL APERTURA', 2, 1, '2025-07-16'),
      phase('CLAUSURA RUEDA', 6, 15, '2025-07-23'),
    ]);
    expect(t.map((x) => x.name)).toEqual(['Apertura', 'Clausura']);
    const apertura = t[0]!;
    expect(apertura.phases.map((p) => p.serie)).toEqual([
      'APERTURA',
      'APERTURA - SERIE 2',
      'APERTURA SERIE 1',
      'FINAL DEL APERTURA',
    ]);
    expect(apertura.phases.find((p) => p.serie === 'FINAL DEL APERTURA')?.role).toBe('final');
    expect(apertura.key).toBe('FUTSAL:112:M:apertura:apertura');
  });

  it('puts 2016 COPA DE ORO, FINAL ORO and 3º Y 4º PUESTO in one Copa de Oro tournament', () => {
    const [oro] = groupPhases('FUTSAL', 103, 'M', [
      phase('COPA DE ORO', 4, 2, '2016-10-02'),
      phase('FINAL ORO', 2, 1, '2016-10-30'),
      phase('3º Y 4º PUESTO', 2, 1, '2016-10-30'),
    ]);
    expect(oro?.name).toBe('Copa de Oro');
    expect(Object.fromEntries(oro!.phases.map((p) => [p.serie, p.role]))).toEqual({
      'COPA DE ORO': 'knockout',
      'FINAL ORO': 'final',
      '3º Y 4º PUESTO': 'third_place',
    });
  });

  it('lets an override assign 2023 "Futbol Sala Serie 1" to the Apertura', () => {
    const t = groupPhases(
      'FUTSAL',
      110,
      'M',
      [phase('Futbol Sala Apertura', 6, 15, '2023-04-24'), phase('Futbol Sala Serie 1', 3, 3, '2023-06-14')],
      [{ season: 110, serie: 'Futbol Sala Serie 1', kind: 'apertura' }],
    );
    expect(t).toHaveLength(1);
    expect(t[0]?.phases.map((p) => [p.serie, p.overridden])).toEqual([
      ['Futbol Sala Apertura', false],
      ['Futbol Sala Serie 1', true],
    ]);
  });

  it('makes an unrecognized name its own tournament and flags it', () => {
    const t = groupPhases('FUTSAL', 106, 'M', [phase('SERIE 1', 3, 3, '2019-11-13'), phase('SERIE 2', 3, 2, '2019-11-13')]);
    expect(t.map((x) => x.name)).toEqual(['Serie 1', 'Serie 2']);
    expect(t.every((x) => x.phases[0]?.unrecognized)).toBe(true);
  });
});

describe('team identity', () => {
  it('matches normalized names within a category', () => {
    const r = createTeamResolver();
    expect(r.key('NAUTICO CARRASCO Y PUNTA GORDA', 'M')).toBe(r.key('Nautico Carrasco y Punta  Gorda', 'M'));
    expect(r.key('ARGOS ', 'M')).toBe('M:ARGOS');
  });

  it('merges a renamed team through the alias list', () => {
    const r = createTeamResolver([{ canonical: 'C.U.B.A.', aliases: ['CUBA'] }]);
    expect(r.key('CUBA', 'M')).toBe(r.key('C.U.B.A.', 'M'));
  });

  it('keeps men’s and women’s teams separate', () => {
    const r = createTeamResolver();
    expect(r.key('ALEMAN UNIVERSITARIO', 'M')).not.toBe(r.key('ALEMAN UNIVERSITARIO', 'F'));
  });
});
