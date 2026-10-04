import { Type, type Static } from 'typebox';
import { Category, MatchSummary, Nullable, PhaseRef, PlayerRef, Result, TeamRef, TournamentRef } from './common';
import { Page } from './players';

export const TeamListItem = Type.Object({
  team: TeamRef,
  firstYear: Type.Integer(),
  lastYear: Type.Integer(),
  played: Type.Integer(),
  winPct: Nullable(Type.Number()),
  titles: Type.Integer(),
});
export const TeamList = Page(TeamListItem);

export const TeamTotals = Type.Object({
  played: Type.Integer(),
  wins: Type.Integer(),
  draws: Type.Integer(),
  losses: Type.Integer(),
  winPct: Nullable(Type.Number()),
  pointsPct: Nullable(Type.Number()),
  gf: Type.Integer(),
  ga: Type.Integer(),
  gd: Type.Integer(),
  gfPerMatch: Nullable(Type.Number()),
  gaPerMatch: Nullable(Type.Number()),
  cleanSheets: Type.Integer(),
  woWins: Type.Integer(),
  woLosses: Type.Integer(),
});

export const Streak = Type.Object({
  kind: Type.Union([Type.Literal('win'), Type.Literal('unbeaten'), Type.Literal('loss'), Type.Literal('winless')]),
  length: Type.Integer(),
  startDate: Nullable(Type.String()),
  endDate: Nullable(Type.String()),
});

export const TeamProfile = Type.Object({
  team: TeamRef,
  otherNames: Type.Array(Type.String()),
  totals: TeamTotals,
  seasons: Type.Array(Type.Integer()),
  titles: Type.Array(TournamentRef),
  firstMatch: Nullable(MatchSummary),
  lastMatch: Nullable(MatchSummary),
  form: Type.Array(Type.Object({ result: Result, match: MatchSummary })),
  currentStreak: Nullable(Streak),
  longestStreaks: Type.Array(Streak),
  biggestWin: Nullable(MatchSummary),
  biggestLoss: Nullable(MatchSummary),
  highestScoring: Nullable(MatchSummary),
});

export const TeamSeasonRow = Type.Object({
  seasonYear: Type.Integer(),
  category: Category,
  tournaments: Type.Array(TournamentRef),
  positions: Type.Array(Type.Object({ phase: PhaseRef, tournament: TournamentRef, position: Type.Integer(), teams: Type.Integer() })),
  played: Type.Integer(),
  wins: Type.Integer(),
  draws: Type.Integer(),
  losses: Type.Integer(),
  gf: Type.Integer(),
  ga: Type.Integer(),
  topScorer: Nullable(Type.Object({ player: PlayerRef, goals: Type.Integer() })),
});
export const TeamSeasons = Type.Object({ rows: Type.Array(TeamSeasonRow) });

export const SquadRow = Type.Object({
  player: PlayerRef,
  apps: Type.Integer(),
  goals: Type.Integer(),
  yellow: Type.Integer(),
  red: Type.Integer(),
  captain: Type.Integer(),
});
export const TeamSquad = Type.Object({ seasonYear: Nullable(Type.Integer()), seasons: Type.Array(Type.Integer()), rows: Type.Array(SquadRow) });

export const LeaderRow = Type.Object({ player: PlayerRef, value: Type.Integer(), apps: Type.Integer() });
export const TeamLeaders = Type.Object({
  goals: Type.Array(LeaderRow),
  apps: Type.Array(LeaderRow),
  red: Type.Array(LeaderRow),
  yellow: Type.Array(LeaderRow),
  captain: Type.Array(LeaderRow),
});

export const TeamOpponentRow = Type.Object({
  opponent: TeamRef,
  played: Type.Integer(),
  wins: Type.Integer(),
  draws: Type.Integer(),
  losses: Type.Integer(),
  gf: Type.Integer(),
  ga: Type.Integer(),
  gd: Type.Integer(),
  winPct: Nullable(Type.Number()),
});
export const TeamOpponents = Type.Object({ rows: Type.Array(TeamOpponentRow), totalPlayed: Type.Integer() });

export const TeamMatchRow = Type.Object({ match: MatchSummary, result: Result, gf: Type.Integer(), ga: Type.Integer() });
export const TeamMatches = Type.Object({ rows: Type.Array(TeamMatchRow), total: Type.Integer() });

export type TeamListItem = Static<typeof TeamListItem>;
export type TeamList = Static<typeof TeamList>;
export type TeamTotals = Static<typeof TeamTotals>;
export type Streak = Static<typeof Streak>;
export type TeamProfile = Static<typeof TeamProfile>;
export type TeamSeasonRow = Static<typeof TeamSeasonRow>;
export type TeamSeasons = Static<typeof TeamSeasons>;
export type SquadRow = Static<typeof SquadRow>;
export type TeamSquad = Static<typeof TeamSquad>;
export type LeaderRow = Static<typeof LeaderRow>;
export type TeamLeaders = Static<typeof TeamLeaders>;
export type TeamOpponentRow = Static<typeof TeamOpponentRow>;
export type TeamOpponents = Static<typeof TeamOpponents>;
export type TeamMatchRow = Static<typeof TeamMatchRow>;
export type TeamMatches = Static<typeof TeamMatches>;
