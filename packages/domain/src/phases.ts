import { normalizeName, titleCase } from './names';

export const TOURNAMENT_KINDS = ['apertura', 'clausura', 'liga', 'oro', 'plata', 'anual', 'otro'] as const;
export type TournamentKind = (typeof TOURNAMENT_KINDS)[number];

export const PHASE_ROLES = ['league', 'knockout', 'final', 'third_place'] as const;
export type PhaseRole = (typeof PHASE_ROLES)[number];

/** Spanish labels shown for each tournament kind. */
export const KIND_LABELS: Record<TournamentKind, string> = {
  apertura: 'Apertura',
  clausura: 'Clausura',
  liga: 'Torneo',
  oro: 'Copa de Oro / Play-off',
  plata: 'Copa de Plata',
  anual: 'Final anual / Universitario',
  otro: 'Otro',
};

/** Display order of tournaments within a season. */
export const KIND_ORDER: Record<TournamentKind, number> = {
  liga: 0,
  apertura: 1,
  clausura: 2,
  oro: 3,
  plata: 4,
  anual: 5,
  otro: 6,
};

export type RoleHint = 'final' | 'third_place' | 'knockout' | null;

export interface PhaseNameClass {
  kind: TournamentKind;
  roleHint: RoleHint;
}

const THIRD_PLACE = /\b3\s*º?\s*Y\s*4|\bTERCER\b/;
const PLATA = /PLATA|\bCP\b/;
const ANUAL = /ANUAL|UNIVERSITARIO/;
const ORO = /\bORO\b|TITULO|\bCO\b/;
const APERTURA = /APERTURA/;
const CLAUSURA = /CLAUSURA|\bCLA\b/;
const KNOCKOUT = /SEMI|CUARTOS|PLAY\s*-?\s*OFF|PLAY\s*-?\s*IN\b|REPECHAJE/;
const FINAL = /\bFINAL(ES)?\b/;
/** "CUARTOS DE FINAL" / "OCTAVOS DE FINAL" are rounds, not finals. */
const ROUND_OF = /\b(CUARTOS|OCTAVOS)\s+DE\s+FINAL(ES)?\b/g;
const LIGA = /RUEDA|CLASIFICATORI|DIVISIONAL|\bCOPA\s+\d|TORNEO|FUTSAL|FUTBOL SALA/;

/**
 * Classify a source series name (design D6). Kind precedence, first match wins:
 *   third place → Plata → Final anual/Universitario → Oro/título → Apertura → Clausura
 *   → play-off markers (Oro) → bare finals (Oro) → league markers (Liga) → Otro.
 */
export function classifyPhaseName(serie: string): PhaseNameClass {
  const n = normalizeName(serie).replace(ROUND_OF, '$1');
  if (THIRD_PLACE.test(n)) return { kind: PLATA.test(n) ? 'plata' : 'oro', roleHint: 'third_place' };
  const roleHint: RoleHint = FINAL.test(n) ? 'final' : KNOCKOUT.test(n) ? 'knockout' : null;
  let kind: TournamentKind;
  if (PLATA.test(n)) kind = 'plata';
  else if (ANUAL.test(n)) kind = 'anual';
  else if (ORO.test(n)) kind = 'oro';
  else if (APERTURA.test(n)) kind = 'apertura';
  else if (CLAUSURA.test(n)) kind = 'clausura';
  else if (KNOCKOUT.test(n) || FINAL.test(n)) kind = 'oro';
  else if (LIGA.test(n)) kind = 'liga';
  else kind = 'otro';
  return { kind, roleHint };
}

export interface PhaseShape {
  /** Distinct teams that played in the phase. */
  teams: number;
  /** Distinct pairings that met at least once. */
  pairs: number;
}

/** Share of all possible pairings that must have met for a phase to count as a round-robin. */
export const LEAGUE_PAIR_COVERAGE = 0.75;

export function isLeagueShape(shape: PhaseShape): boolean {
  const allPairs = (shape.teams * (shape.teams - 1)) / 2;
  return shape.teams >= 3 && shape.pairs >= allPairs * LEAGUE_PAIR_COVERAGE;
}

/**
 * Combine the name hint with the phase's shape:
 *  - third place and knockout markers always win;
 *  - a "final" whose shape is a round-robin of 3+ teams (e.g. 2009 "Finales Plata") is a league;
 *  - without a hint: round-robin shape → league; exactly two teams → final; otherwise knockout.
 */
export function resolvePhaseRole(hint: RoleHint, shape: PhaseShape): PhaseRole {
  if (hint === 'third_place' || hint === 'knockout') return hint;
  if (hint === 'final') return isLeagueShape(shape) ? 'league' : 'final';
  if (isLeagueShape(shape)) return 'league';
  return shape.teams === 2 ? 'final' : 'knockout';
}

/** Tournament display name for a group of phases of one kind. */
export function tournamentName(kind: TournamentKind, phaseNames: string[]): string {
  const all = phaseNames.map(normalizeName).join(' | ');
  switch (kind) {
    case 'oro':
      return /\bORO\b|\bCO\b/.test(all) ? 'Copa de Oro' : 'Play-off';
    case 'anual':
      return /UNIVERSITARIO/.test(all) ? 'Universitario' : 'Final anual';
    case 'otro':
      return phaseDisplayName(phaseNames[0] ?? 'Otro');
    default:
      return KIND_LABELS[kind];
  }
}

const PHASE_ACRONYMS = new Set(['CO', 'CP', 'II', 'III']);

/** "FINAL DEL APERTURA" → "Final del Apertura"; 'Divisional " A "' → 'Divisional "A"'. */
export function phaseDisplayName(serie: string): string {
  const cleaned = serie.replace(/"\s*(\S+?)\s*"/g, '"$1"').replace(/\s+/g, ' ').trim();
  return titleCase(cleaned, (t) => PHASE_ACRONYMS.has(normalizeName(t)) || /^"?\p{L}"?$/u.test(t) && !/^[yYeE]$/.test(t));
}
