import { Type, type Static } from 'typebox';
import { Category, Kind, MatchSummary, Nullable, PhaseRef, PlayerRef, TeamRef, TournamentRef } from './common';

export const ChampionInfo = Type.Object({
  team: Nullable(TeamRef),
  method: Type.Union([Type.Literal('override'), Type.Literal('final'), Type.Literal('league'), Type.Literal('undetermined')]),
});

export const ScorerRow = Type.Object({
  player: PlayerRef,
  teams: Type.Array(TeamRef),
  goals: Type.Integer(),
  apps: Type.Integer(),
  rank: Type.Integer(),
});

export const SeasonListItem = Type.Object({
  year: Type.Integer(),
  name: Nullable(Type.String()),
  categories: Type.Array(Category),
  matches: Type.Integer(),
  goals: Type.Integer(),
  champions: Type.Array(Type.Object({ tournament: TournamentRef, champion: ChampionInfo })),
});

export const PhaseListItem = Type.Object({
  phase: PhaseRef,
  startDate: Nullable(Type.String()),
  endDate: Nullable(Type.String()),
  matches: Type.Integer(),
});

export const TournamentSummary = Type.Object({
  tournament: TournamentRef,
  champion: ChampionInfo,
  phases: Type.Array(PhaseListItem),
  startDate: Nullable(Type.String()),
  endDate: Nullable(Type.String()),
});

export const CategorySummary = Type.Object({
  category: Category,
  matches: Type.Integer(),
  goals: Type.Integer(),
  goalsPerMatch: Nullable(Type.Number()),
  attributedShare: Nullable(Type.Number()),
  tournaments: Type.Array(TournamentSummary),
  topScorers: Type.Array(ScorerRow),
});

export const SeasonDetail = Type.Object({
  year: Type.Integer(),
  name: Nullable(Type.String()),
  categories: Type.Array(CategorySummary),
});

export const StandingRow = Type.Object({
  position: Type.Integer(),
  team: TeamRef,
  pj: Type.Integer(),
  pg: Type.Integer(),
  pe: Type.Integer(),
  pp: Type.Integer(),
  gf: Type.Integer(),
  gc: Type.Integer(),
  dg: Type.Integer(),
  pts: Type.Integer(),
});

export const Standings = Type.Object({
  /** official: as published by the league; computed: from match results. */
  type: Type.Union([Type.Literal('official'), Type.Literal('computed')]),
  afterRound: Nullable(Type.Integer()),
  rows: Type.Array(StandingRow),
});

export const RoundInfo = Type.Object({
  round: Type.Integer(),
  startDate: Nullable(Type.String()),
  endDate: Nullable(Type.String()),
  matchCount: Type.Integer(),
});

export const PhaseDetail = Type.Object({
  phase: PhaseRef,
  tournament: TournamentRef,
  sourceName: Type.String(),
  rounds: Type.Array(RoundInfo),
  selectedRound: Nullable(Type.Integer()),
  matches: Type.Array(MatchSummary),
  standings: Nullable(Standings),
});

export const TournamentDetail = Type.Object({
  tournament: TournamentRef,
  champion: ChampionInfo,
  summary: Type.Object({
    matches: Type.Integer(),
    goals: Type.Integer(),
    goalsPerMatch: Nullable(Type.Number()),
    yellowCards: Type.Integer(),
    redCards: Type.Integer(),
    attributedShare: Nullable(Type.Number()),
  }),
  phases: Type.Array(
    Type.Object({
      phase: PhaseRef,
      startDate: Nullable(Type.String()),
      endDate: Nullable(Type.String()),
      standings: Nullable(Standings),
      /** Matches are listed for knockout, final and third-place phases. */
      matches: Type.Array(MatchSummary),
    }),
  ),
  topScorers: Type.Array(ScorerRow),
});

export const TournamentListItem = Type.Object({
  tournament: TournamentRef,
  champion: ChampionInfo,
  matches: Type.Integer(),
});

export const ChampionsData = Type.Object({
  seasons: Type.Array(
    Type.Object({
      year: Type.Integer(),
      titles: Type.Array(Type.Object({ tournament: TournamentRef, champion: ChampionInfo })),
    }),
  ),
  ranking: Type.Array(
    Type.Object({
      team: TeamRef,
      titles: Type.Integer(),
      tournaments: Type.Array(TournamentRef),
      rank: Type.Integer(),
    }),
  ),
});

export const KindInfo = Type.Object({ kind: Kind, label: Type.String() });

export type ChampionInfo = Static<typeof ChampionInfo>;
export type ScorerRow = Static<typeof ScorerRow>;
export type SeasonListItem = Static<typeof SeasonListItem>;
export type SeasonDetail = Static<typeof SeasonDetail>;
export type CategorySummary = Static<typeof CategorySummary>;
export type TournamentSummary = Static<typeof TournamentSummary>;
export type StandingRow = Static<typeof StandingRow>;
export type Standings = Static<typeof Standings>;
export type RoundInfo = Static<typeof RoundInfo>;
export type PhaseDetail = Static<typeof PhaseDetail>;
export type TournamentDetail = Static<typeof TournamentDetail>;
export type TournamentListItem = Static<typeof TournamentListItem>;
export type ChampionsData = Static<typeof ChampionsData>;
export type KindInfo = Static<typeof KindInfo>;
