import { normalizeName, slugify } from './names';
import type { PhaseOverride } from './overrides';
import {
  classifyPhaseName,
  KIND_ORDER,
  resolvePhaseRole,
  tournamentName,
  type PhaseRole,
  type PhaseShape,
  type TournamentKind,
} from './phases';

export type Category = 'M' | 'F';

export interface PhaseInput {
  torneo: string;
  serie: string;
  shape: PhaseShape;
  /** ISO dates of the phase's first and last match (may be null when it has no matches yet). */
  startDate: string | null;
  endDate: string | null;
}

export interface GroupedPhase extends PhaseInput {
  key: string;
  role: PhaseRole;
  overridden: boolean;
  /** True when no rule recognized the series name (reported for curation). */
  unrecognized: boolean;
}

export interface GroupedTournament {
  key: string;
  kind: TournamentKind;
  name: string;
  phases: GroupedPhase[];
  startDate: string | null;
  endDate: string | null;
}

export function phaseKey(sport: string, seasonCode: number, category: Category, torneo: string, serie: string): string {
  return `${sport}:${seasonCode}:${category}:${normalizeName(torneo)}:${normalizeName(serie)}`;
}

function findOverride(overrides: PhaseOverride[], seasonCode: number, p: PhaseInput): PhaseOverride | undefined {
  return overrides.find(
    (o) =>
      o.season === seasonCode &&
      normalizeName(o.serie) === normalizeName(p.serie) &&
      (o.torneo === undefined || normalizeName(o.torneo) === normalizeName(p.torneo)),
  );
}

const minDate = (a: string | null, b: string | null) => (!a ? b : !b ? a : a < b ? a : b);
const maxDate = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b);

/**
 * Group one season's phases of one category into tournaments (design D6).
 * Default grouping is by tournament kind; an override may set kind, role and tournament name.
 * Unrecognized names ("otro") become their own tournament.
 */
export function groupPhases(
  sport: string,
  seasonCode: number,
  category: Category,
  phases: PhaseInput[],
  overrides: PhaseOverride[] = [],
): GroupedTournament[] {
  const groups = new Map<string, { kind: TournamentKind; explicitName?: string; phases: GroupedPhase[] }>();
  for (const p of phases) {
    const o = findOverride(overrides, seasonCode, p);
    const cls = classifyPhaseName(p.serie);
    const kind = o?.kind ?? cls.kind;
    const role = o?.role ?? resolvePhaseRole(cls.roleHint, p.shape);
    const groupId = o?.tournament
      ? `${kind}|${normalizeName(o.tournament)}`
      : kind === 'otro'
        ? `otro|${normalizeName(p.serie)}`
        : kind;
    const g = groups.get(groupId) ?? { kind, explicitName: o?.tournament, phases: [] };
    g.phases.push({
      ...p,
      key: phaseKey(sport, seasonCode, category, p.torneo, p.serie),
      role,
      overridden: Boolean(o),
      unrecognized: !o && cls.kind === 'otro',
    });
    groups.set(groupId, g);
  }
  const tournaments = [...groups.values()].map((g) => {
    g.phases.sort((a, b) => (a.startDate ?? '9999').localeCompare(b.startDate ?? '9999') || a.serie.localeCompare(b.serie));
    const name = g.explicitName ?? tournamentName(g.kind, g.phases.map((p) => p.serie));
    return {
      key: `${sport}:${seasonCode}:${category}:${g.kind}:${slugify(name)}`,
      kind: g.kind,
      name,
      phases: g.phases,
      startDate: g.phases.reduce<string | null>((d, p) => minDate(d, p.startDate), null),
      endDate: g.phases.reduce<string | null>((d, p) => maxDate(d, p.endDate), null),
    };
  });
  return tournaments.sort(
    (a, b) =>
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      (a.startDate ?? '9999').localeCompare(b.startDate ?? '9999') ||
      a.name.localeCompare(b.name),
  );
}
