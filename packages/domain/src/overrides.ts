import { Type, type Static, type TSchema } from 'typebox';
import { Compile } from 'typebox/compile';
import { parse as parseYaml } from 'yaml';

const Category = Type.Union([Type.Literal('M'), Type.Literal('F')]);
// Keep in sync with TOURNAMENT_KINDS / PHASE_ROLES in ./phases (checked by overrides.test.ts).
const Kind = Type.Union([
  Type.Literal('apertura'),
  Type.Literal('clausura'),
  Type.Literal('liga'),
  Type.Literal('oro'),
  Type.Literal('plata'),
  Type.Literal('anual'),
  Type.Literal('otro'),
]);
const Role = Type.Union([
  Type.Literal('league'),
  Type.Literal('knockout'),
  Type.Literal('final'),
  Type.Literal('third_place'),
]);
export const OVERRIDE_KIND_SCHEMA = Kind;
export const OVERRIDE_ROLE_SCHEMA = Role;

const DisplayNames = Type.Object({
  /** Published team name (any spelling) → display name. */
  teams: Type.Optional(Type.Record(Type.String(), Type.String())),
  /** Membership card number → display name. */
  players: Type.Optional(Type.Record(Type.String(), Type.String())),
  /** Extra team-name tokens kept in capitals. */
  acronyms: Type.Optional(Type.Array(Type.String())),
});

const TeamAlias = Type.Object({
  canonical: Type.String(),
  aliases: Type.Array(Type.String()),
  category: Type.Optional(Category),
});

const PhaseOverride = Type.Object({
  /** Source season code (e.g. 110 = 2023). */
  season: Type.Integer(),
  torneo: Type.Optional(Type.String()),
  serie: Type.String(),
  kind: Type.Optional(Kind),
  role: Type.Optional(Role),
  /** Tournament display name, e.g. "Apertura". Phases sharing kind+name form one tournament. */
  tournament: Type.Optional(Type.String()),
});

const ChampionOverride = Type.Object({
  /** Season year (e.g. 2016). */
  season: Type.Integer(),
  category: Category,
  kind: Kind,
  tournament: Type.Optional(Type.String()),
  /** Published team name, or null to force "Campeón no determinado". */
  team: Type.Union([Type.String(), Type.Null()]),
});

export type DisplayNameOverrides = Static<typeof DisplayNames>;
export type TeamAliasOverride = Static<typeof TeamAlias>;
export type PhaseOverride = Static<typeof PhaseOverride>;
export type ChampionOverride = Static<typeof ChampionOverride>;

export interface Overrides {
  displayNames: DisplayNameOverrides;
  teamAliases: TeamAliasOverride[];
  phases: PhaseOverride[];
  champions: ChampionOverride[];
}

export const emptyOverrides = (): Overrides => ({ displayNames: {}, teamAliases: [], phases: [], champions: [] });

function validated<S extends TSchema>(file: string, schema: S, value: unknown): Static<S> {
  const v = Compile(schema);
  if (!v.Check(value)) {
    const e = [...v.Errors(value)][0];
    throw new Error(`Invalid overrides file ${file}: ${e?.instancePath ?? ''} ${e?.message ?? ''}`);
  }
  return value as Static<S>;
}

/** Parse the YAML texts of data/overrides/*.yaml. Missing or empty files mean "no overrides". */
export function parseOverrides(texts: {
  displayNames?: string;
  teamAliases?: string;
  phases?: string;
  champions?: string;
}): Overrides {
  const load = (t?: string): unknown => (t ? (parseYaml(t) ?? undefined) : undefined);
  return {
    displayNames: validated('display-names.yaml', DisplayNames, load(texts.displayNames) ?? {}),
    teamAliases: validated('team-aliases.yaml', Type.Array(TeamAlias), load(texts.teamAliases) ?? []),
    phases: validated('phases.yaml', Type.Array(PhaseOverride), load(texts.phases) ?? []),
    champions: validated('champions.yaml', Type.Array(ChampionOverride), load(texts.champions) ?? []),
  };
}
