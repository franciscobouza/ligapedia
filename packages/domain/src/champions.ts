import { normalizeName } from './names';
import type { ChampionOverride } from './overrides';
import type { PhaseRole, TournamentKind } from './phases';
import type { Category } from './tournaments';

export interface ChampionMatch<T> {
  home: T;
  away: T;
  homeGoals: number | null;
  awayGoals: number | null;
  /** Global chronological order. */
  order: number;
}

export interface ChampionPhase<T> {
  role: PhaseRole;
  sortOrder: number;
  matches: ChampionMatch<T>[];
  /** Standings leader (official when published, otherwise computed); null without standings. */
  leader: T | null;
}

export interface ChampionTournament<T> {
  seasonYear: number;
  category: Category;
  kind: TournamentKind;
  name: string;
  phases: ChampionPhase<T>[];
}

export type ChampionMethod = 'override' | 'final' | 'league' | 'undetermined';

export interface ChampionResult<T> {
  team: T | null;
  method: ChampionMethod;
}

/** Find a curated override; `team` is the published name (resolved by the caller). */
export function findChampionOverride(
  overrides: ChampionOverride[],
  t: { seasonYear: number; category: Category; kind: TournamentKind; name: string },
): ChampionOverride | undefined {
  return overrides.find(
    (o) =>
      o.season === t.seasonYear &&
      o.category === t.category &&
      o.kind === t.kind &&
      (o.tournament === undefined || normalizeName(o.tournament) === normalizeName(t.name)),
  );
}

/**
 * Champion rule (specs/competitions "Champions"), after overrides:
 *  1. Final phase(s): take the pair that played the last final match; the team with more wins in
 *     the final-phase matches between them is champion; equal wins → aggregate goal difference.
 *  2. No final phase: leader of the last league phase.
 *  3. Otherwise undetermined. Third-place phases never count.
 */
export function determineChampion<T>(t: ChampionTournament<T>): ChampionResult<T> {
  const finals = t.phases.filter((p) => p.role === 'final');
  if (finals.length > 0) {
    const played = finals
      .flatMap((p) => p.matches)
      .filter((m) => m.homeGoals !== null && m.awayGoals !== null)
      .sort((a, b) => a.order - b.order);
    const last = played.at(-1);
    if (!last) return { team: null, method: 'undetermined' };
    const a = last.home;
    const b = last.away;
    let winsA = 0;
    let winsB = 0;
    let gdA = 0;
    for (const m of played) {
      const isAB = m.home === a && m.away === b;
      const isBA = m.home === b && m.away === a;
      if (!isAB && !isBA) continue;
      const goalsA = (isAB ? m.homeGoals : m.awayGoals)!;
      const goalsB = (isAB ? m.awayGoals : m.homeGoals)!;
      if (goalsA > goalsB) winsA++;
      else if (goalsB > goalsA) winsB++;
      gdA += goalsA - goalsB;
    }
    if (winsA !== winsB) return { team: winsA > winsB ? a : b, method: 'final' };
    if (gdA !== 0) return { team: gdA > 0 ? a : b, method: 'final' };
    return { team: null, method: 'undetermined' };
  }
  const league = t.phases.filter((p) => p.role === 'league').sort((x, y) => x.sortOrder - y.sortOrder).at(-1);
  if (league?.leader != null) return { team: league.leader, method: 'league' };
  return { team: null, method: 'undetermined' };
}
