import { describe, expect, it } from 'vitest';
import { determineChampion, findChampionOverride, type ChampionPhase, type ChampionTournament } from './champions';

const t = (phases: ChampionPhase<string>[]): ChampionTournament<string> => ({
  seasonYear: 2025,
  category: 'M',
  kind: 'oro',
  name: 'Copa de Oro',
  phases,
});
const m = (home: string, hg: number | null, ag: number | null, away: string, order: number) => ({
  home,
  away,
  homeGoals: hg,
  awayGoals: ag,
  order,
});

describe('champion rule', () => {
  it('awards a single-match final to its winner', () => {
    expect(determineChampion(t([{ role: 'final', sortOrder: 2, leader: null, matches: [m('A', 4, 2, 'B', 10)] }]))).toEqual({
      team: 'A',
      method: 'final',
    });
  });

  it('awards a two-legged final on wins (A won 5–3 and drew 2–2)', () => {
    const r = determineChampion(
      t([{ role: 'final', sortOrder: 2, leader: null, matches: [m('A', 5, 3, 'B', 10), m('B', 2, 2, 'A', 11)] }]),
    );
    expect(r).toEqual({ team: 'A', method: 'final' });
  });

  it('breaks equal wins by aggregate goal difference', () => {
    const r = determineChampion(
      t([{ role: 'final', sortOrder: 2, leader: null, matches: [m('A', 5, 1, 'B', 10), m('B', 3, 2, 'A', 11)] }]),
    );
    expect(r).toEqual({ team: 'A', method: 'final' });
  });

  it('is undetermined when wins and aggregate goal difference are equal', () => {
    const r = determineChampion(
      t([{ role: 'final', sortOrder: 2, leader: null, matches: [m('A', 3, 1, 'B', 10), m('B', 3, 1, 'A', 11)] }]),
    );
    expect(r).toEqual({ team: null, method: 'undetermined' });
  });

  it('is undetermined while the final has no score', () => {
    expect(determineChampion(t([{ role: 'final', sortOrder: 1, leader: null, matches: [m('A', null, null, 'B', 1)] }]))).toEqual({
      team: null,
      method: 'undetermined',
    });
  });

  it('ignores third-place play-offs and semifinal results', () => {
    const r = determineChampion(
      t([
        { role: 'knockout', sortOrder: 1, leader: null, matches: [m('A', 1, 0, 'C', 1), m('B', 2, 0, 'D', 2)] },
        { role: 'final', sortOrder: 2, leader: null, matches: [m('A', 1, 3, 'B', 5)] },
        { role: 'third_place', sortOrder: 3, leader: null, matches: [m('C', 9, 0, 'D', 6)] },
      ]),
    );
    expect(r).toEqual({ team: 'B', method: 'final' });
  });

  it('uses the last league phase leader when there is no final phase', () => {
    const r = determineChampion(
      t([
        { role: 'league', sortOrder: 1, leader: 'X', matches: [] },
        { role: 'league', sortOrder: 2, leader: 'Y', matches: [] },
      ]),
    );
    expect(r).toEqual({ team: 'Y', method: 'league' });
  });

  it('finds curated overrides by season, category, kind and optional name', () => {
    const o = [{ season: 2016, category: 'M' as const, kind: 'oro' as const, team: 'ALEMAN UNIVERSITARIO' }];
    expect(findChampionOverride(o, { seasonYear: 2016, category: 'M', kind: 'oro', name: 'Copa de Oro' })?.team).toBe(
      'ALEMAN UNIVERSITARIO',
    );
    expect(findChampionOverride(o, { seasonYear: 2016, category: 'F', kind: 'oro', name: 'Copa de Oro' })).toBeUndefined();
  });
});
