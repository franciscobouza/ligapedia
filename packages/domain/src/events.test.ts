import { describe, expect, it } from 'vitest';
import { matchSourceFromFixtures } from '../test/fixtures';
import { normalizeMatch, type MatchSource } from './events';

describe('match event rules (real fixtures)', () => {
  it('detects the own goal in match 19906 by lineup membership', () => {
    const m = normalizeMatch(matchSourceFromFixtures('19906', 2009));
    const og = m.goals.filter((g) => g.ownGoal);
    expect(og).toEqual([expect.objectContaining({ side: 'A', carne: '26947', ownGoal: true })]);
    expect(m.goals.filter((g) => g.carne === '26947' && !g.ownGoal)).toHaveLength(1); // also scored for his team
    expect(m.venue).toBeNull(); // CANCHA A FIJAR
  });

  it('attributes the red cards of match 24293 through the lineups', () => {
    const m = normalizeMatch(matchSourceFromFixtures('24293', 2010));
    const reds = m.cards.filter((c) => c.color === 'R');
    expect(reds).toHaveLength(4);
    expect(reds.every((c) => c.carne !== null)).toBe(true);
    expect(reds.find((c) => c.rawName === 'ANDRES MAURICIO REPETTO')?.side).toBe('H');
  });

  it('flags the walk-over of match 55623 and keeps its observation', () => {
    const m = normalizeMatch(matchSourceFromFixtures('55623', 2017));
    expect(m.walkOver).toBe(true);
    expect([m.homeGoals, m.awayGoals]).toEqual([0, 3]);
    expect([m.homePoints, m.awayPoints]).toEqual([0, 3]);
    expect(m.observations).toBe('Equipo local (CUBA) no se presenta.');
  });

  it('uses the listing time as kickoff for match 92923 and keeps the details time', () => {
    const m = normalizeMatch(matchSourceFromFixtures('92923', 2025));
    expect(m.kickoffLocal).toBe('2025-05-16 20:45:00');
    expect(m.detailsStart).toBe('2025-05-16 22:00:00');
    expect(m.doubtfulDate).toBe(false);
    expect(m.goals.every((g) => g.minute === 1)).toBe(true); // placeholder minutes kept verbatim
    expect(m.appearances.find((a) => a.captain && a.side === 'H')).toMatchObject({ shirt: 1 });
    expect(m.officials).toEqual([]); // jueces HTTP 500 → none
  });
});

function synthetic(over: Partial<MatchSource> = {}): MatchSource {
  const lineup = (prefix: string, n: number) =>
    Array.from({ length: n }, (_, i) => ({ carne: `${prefix}${i}`, Nombre: `JUGADOR ${prefix}${i}`, camiseta: `${i}`, Capitan: '' }));
  const goal = (carne: string) => ({ carne, Nombre: `JUGADOR ${carne}`, minutos: '1', EnContra: '0' });
  return {
    listing: { Fecha: '1', Fecha_Hora: '2015-06-21 20:00:00', Cancha: 'G. UGAB', Locatario: 'A', GL: '12', Visitante: 'B', GV: '4', ID: '1' },
    detail: null,
    lineups: { H: lineup('h', 8), A: lineup('a', 8) },
    goals: { H: ['h1', 'h1', 'h2', 'h3', 'h4'].map(goal), A: ['a1', 'a2', 'a3', 'a3'].map(goal) },
    yellows: { H: [], A: [] },
    reds: { H: [], A: [] },
    substitutions: { H: [], A: [] },
    referees: [{ Cargo: 'Arbitro', Nombre: 'A A ,FEDERACION' }],
    seasonYear: 2015,
    ...over,
  };
}

describe('match event rules (synthetic)', () => {
  it('turns missing scorers of a 12–4 into 7 unattributed home goals', () => {
    const m = normalizeMatch(synthetic());
    expect(m.unattributed).toEqual({ H: 7, A: 0 });
    expect(m.inconsistent).toBe(false);
    expect([m.homePoints, m.awayPoints]).toEqual([3, 0]);
    expect(m.officials).toEqual([]); // placeholder referee
  });

  it('flags more recorded goals than the score without negative adjustments', () => {
    const base = synthetic();
    const m = normalizeMatch({ ...base, listing: { ...base.listing, GL: '4', GV: '4' } });
    expect(m.inconsistent).toBe(true);
    expect(m.unattributed).toEqual({ H: 0, A: 0 });
    expect(m.goals.filter((g) => g.side === 'H')).toHaveLength(5);
    expect(m.homeGoals).toBe(4);
  });

  it('marks a match without score as programado', () => {
    const base = synthetic();
    const m = normalizeMatch({ ...base, listing: { ...base.listing, GL: null, GV: '' } });
    expect(m.status).toBe('programado');
    expect(m.homePoints).toBeNull();
    expect(m.unattributed).toEqual({ H: 0, A: 0 });
  });

  it('flags a kickoff outside the season year as a doubtful date', () => {
    const base = synthetic();
    const m = normalizeMatch({ ...base, listing: { ...base.listing, Fecha_Hora: '2021-10-21 20:00:00' }, seasonYear: 2009 });
    expect(m.doubtfulDate).toBe(true);
  });

  it('leaves ambiguous and unknown card names unresolved', () => {
    const base = synthetic();
    const twin = { carne: 'h9', Nombre: 'JUGADOR h1', camiseta: '9', Capitan: '' };
    const m = normalizeMatch({
      ...base,
      lineups: { H: [...base.lineups.H, twin], A: base.lineups.A },
      reds: { H: [{ Nombre: 'jugador  h1', observaciones: '' }, { Nombre: 'NADIE', observaciones: 'x' }], A: [{ Nombre: 'Jugador A2' }] },
    });
    expect(m.cards.map((c) => c.carne)).toEqual([null, null, 'a2']);
    expect(m.cards[1]).toMatchObject({ rawName: 'NADIE', observations: 'x' });
  });
});
