import { normalizeName } from './names';
import type {
  GoalRow,
  LineupRow,
  MatchDetailRow,
  MatchListRow,
  RedRow,
  RefereeRow,
  SubstitutionRow,
  YellowRow,
} from './source/schemas';

export type Side = 'H' | 'A';
export const other = (s: Side): Side => (s === 'H' ? 'A' : 'H');

export interface PerSide<T> {
  H: T;
  A: T;
}

export interface MatchSource {
  listing: MatchListRow;
  detail: MatchDetailRow | null;
  lineups: PerSide<LineupRow[]>;
  goals: PerSide<GoalRow[]>;
  yellows: PerSide<YellowRow[]>;
  reds: PerSide<RedRow[]>;
  substitutions: PerSide<SubstitutionRow[]>;
  referees: RefereeRow[];
  seasonYear: number;
}

export interface NormalizedAppearance {
  side: Side;
  carne: string;
  name: string;
  shirt: number | null;
  captain: boolean;
  seq: number;
}

export interface NormalizedGoal {
  /** Side the goal is credited to. */
  side: Side;
  carne: string;
  minute: number | null;
  ownGoal: boolean;
  seq: number;
}

export interface NormalizedCard {
  side: Side;
  color: 'Y' | 'R';
  /** Lineup player the card was attributed to, or null when unresolved. */
  carne: string | null;
  rawName: string;
  observations: string | null;
  seq: number;
}

export interface NormalizedMatch {
  id: number;
  /** Listing Fecha_Hora, Montevideo wall-clock time ("YYYY-MM-DD HH:MM:SS"). */
  kickoffLocal: string | null;
  doubtfulDate: boolean;
  detailsStart: string | null;
  detailsEnd: string | null;
  venue: string | null;
  status: 'jugado' | 'programado';
  homeGoals: number | null;
  awayGoals: number | null;
  homePoints: number | null;
  awayPoints: number | null;
  walkOver: boolean;
  inconsistent: boolean;
  unattributed: PerSide<number>;
  observations: string | null;
  leg: number | null;
  matchNumber: number | null;
  appearances: NormalizedAppearance[];
  goals: NormalizedGoal[];
  cards: NormalizedCard[];
  substitutions: Array<{ side: Side; out: string | null; in: string | null; minute: number | null; seq: number }>;
  officials: Array<{ role: string; name: string; seq: number }>;
}

const VENUE_PLACEHOLDERS = new Set(['CANCHA A FIJAR']);
const REFEREE_PLACEHOLDER = 'AAFEDERACION';

export function toInt(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const t = value.trim();
  if (!/^-?\d+$/.test(t)) return null;
  return Number(t);
}

export function isPlaceholderVenue(name: string | null | undefined): boolean {
  return !name || name.trim() === '' || VENUE_PLACEHOLDERS.has(normalizeName(name));
}

export function isPlaceholderReferee(name: string | null | undefined): boolean {
  return !name || normalizeName(name).replace(/[^A-Z]/g, '') === REFEREE_PLACEHOLDER;
}

/** Points per result when the source does not publish them. */
function defaultPoints(gf: number, ga: number): number {
  return gf > ga ? 3 : gf === ga ? 1 : 0;
}

/** Apply the data-quality rules of specs/data-ingestion to one match. */
export function normalizeMatch(src: MatchSource): NormalizedMatch {
  const { listing, detail } = src;
  const homeGoals = toInt(listing.GL);
  const awayGoals = toInt(listing.GV);
  const played = homeGoals !== null && awayGoals !== null;
  const walkOver = detail?.walk_over?.trim() === '1';

  const kickoffLocal = listing.Fecha_Hora?.trim() || null;
  const kickoffYear = kickoffLocal ? Number(kickoffLocal.slice(0, 4)) : null;

  // Lineups (deduplicated by card number within the match).
  const seen = new Set<string>();
  const appearances: NormalizedAppearance[] = [];
  const lineupCarnes: PerSide<Set<string>> = { H: new Set(), A: new Set() };
  const lineupNames: PerSide<Map<string, string[]>> = { H: new Map(), A: new Map() };
  for (const side of ['H', 'A'] as const) {
    src.lineups[side].forEach((row, i) => {
      if (seen.has(row.carne)) return;
      seen.add(row.carne);
      lineupCarnes[side].add(row.carne);
      const n = normalizeName(row.Nombre);
      lineupNames[side].set(n, [...(lineupNames[side].get(n) ?? []), row.carne]);
      appearances.push({
        side,
        carne: row.carne,
        name: row.Nombre.replace(/\s+/g, ' ').trim(),
        shirt: toInt(row.camiseta),
        captain: /C/i.test(row.Capitan ?? ''),
        seq: i,
      });
    });
  }

  // Goals: credited side = the list they appear in; own goal when the scorer is in the other lineup only.
  const goals: NormalizedGoal[] = [];
  for (const side of ['H', 'A'] as const) {
    src.goals[side].forEach((row, i) => {
      const ownGoal = lineupCarnes[other(side)].has(row.carne) && !lineupCarnes[side].has(row.carne);
      goals.push({ side, carne: row.carne, minute: toInt(row.minutos), ownGoal, seq: i });
    });
  }
  const recorded = { H: src.goals.H.length, A: src.goals.A.length };
  const unattributed = {
    H: played ? Math.max(0, homeGoals - recorded.H) : 0,
    A: played ? Math.max(0, awayGoals - recorded.A) : 0,
  };
  const inconsistent = played && (recorded.H > homeGoals || recorded.A > awayGoals);

  // Cards: attribute by exact normalized name within the lineups (same side first).
  const resolveCard = (side: Side, rawName: string): string | null => {
    const n = normalizeName(rawName);
    for (const s of [side, other(side)]) {
      const hits = lineupNames[s].get(n);
      if (hits && hits.length === 1) return hits[0]!;
      if (hits && hits.length > 1) return null; // ambiguous
    }
    return null;
  };
  const cards: NormalizedCard[] = [];
  let seq = 0;
  for (const side of ['H', 'A'] as const) {
    for (const row of src.yellows[side])
      cards.push({ side, color: 'Y', carne: resolveCard(side, row.Nombre), rawName: row.Nombre.trim(), observations: null, seq: seq++ });
    for (const row of src.reds[side])
      cards.push({
        side,
        color: 'R',
        carne: resolveCard(side, row.Nombre),
        rawName: row.Nombre.trim(),
        observations: row.observaciones?.trim() || null,
        seq: seq++,
      });
  }

  const substitutions = (['H', 'A'] as const).flatMap((side) =>
    src.substitutions[side].map((row, i) => ({
      side,
      out: row.Jug_Sale?.trim() || null,
      in: row.Jug_Entra?.trim() || null,
      minute: toInt(row.minutos),
      seq: i,
    })),
  );

  const officials = src.referees
    .map((r, i) => ({ role: r.Cargo?.trim() || 'Árbitro', name: (r.Nombre ?? '').trim(), seq: i }))
    .filter((r) => !isPlaceholderReferee(r.name));

  const sourcePoints = (v: string | null | undefined) => toInt(v);
  const homePoints = played ? (sourcePoints(detail?.puntos_locatario) ?? defaultPoints(homeGoals, awayGoals)) : null;
  const awayPoints = played ? (sourcePoints(detail?.puntos_visitante) ?? defaultPoints(awayGoals, homeGoals)) : null;

  return {
    id: Number(listing.ID),
    kickoffLocal,
    doubtfulDate: kickoffYear !== null && kickoffYear !== src.seasonYear,
    detailsStart: detail?.Fecha_Inicio ?? null,
    detailsEnd: detail?.Fecha_fin ?? null,
    venue: isPlaceholderVenue(listing.Cancha) ? null : listing.Cancha!.replace(/\s+/g, ' ').trim(),
    status: played ? 'jugado' : 'programado',
    homeGoals,
    awayGoals,
    homePoints,
    awayPoints,
    walkOver,
    inconsistent,
    unattributed,
    observations: detail?.observaciones?.trim() || null,
    leg: toInt(detail?.rueda),
    matchNumber: toInt(detail?.nro_partido),
    appearances,
    goals,
    cards,
    substitutions,
    officials,
  };
}
