import { describe, expect, it } from 'vitest';
import { OVERRIDE_KIND_SCHEMA, OVERRIDE_ROLE_SCHEMA, parseOverrides } from './overrides';
import { PHASE_ROLES, TOURNAMENT_KINDS } from './phases';

describe('overrides parsing', () => {
  it('treats missing files as empty', () => {
    expect(parseOverrides({})).toEqual({ displayNames: {}, teamAliases: [], phases: [], champions: [] });
  });

  it('parses and validates every file', () => {
    const o = parseOverrides({
      displayNames: 'teams:\n  NAUTICO CARRASCO Y PUNTA GORDA: Náutico Carrasco y Punta Gorda\nacronyms: [UTEC]\n',
      teamAliases: '- canonical: C.U.B.A.\n  aliases: [CUBA]\n',
      phases: '- season: 110\n  serie: Futbol Sala Serie 1\n  kind: apertura\n',
      champions: '- season: 2016\n  category: M\n  kind: oro\n  team: null\n',
    });
    expect(o.phases[0]?.kind).toBe('apertura');
    expect(o.champions[0]?.team).toBeNull();
  });

  it('rejects invalid values with the file name', () => {
    expect(() => parseOverrides({ phases: '- season: 110\n  serie: X\n  kind: copa\n' })).toThrow(/phases.yaml/);
  });
});

describe('override schemas', () => {
  it('stay in sync with the domain enumerations', () => {
    const literals = (u: { anyOf: Array<{ const: string }> }) => u.anyOf.map((x) => x.const);
    expect(literals(OVERRIDE_KIND_SCHEMA as never)).toEqual([...TOURNAMENT_KINDS]);
    expect(literals(OVERRIDE_ROLE_SCHEMA as never)).toEqual([...PHASE_ROLES]);
  });
});
