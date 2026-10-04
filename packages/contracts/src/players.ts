import { Type, type Static } from 'typebox';
import { Category, Coverage, MatchSummary, Nullable, PlayerRef, Result, TeamRef, TournamentRef } from './common';

export const PlayerListItem = Type.Object({
  player: PlayerRef,
  teams: Type.Array(TeamRef),
  firstYear: Type.Integer(),
  lastYear: Type.Integer(),
  apps: Type.Integer(),
  goals: Type.Integer(),
});

export const Page = <T extends ReturnType<typeof Type.Object>>(item: T) =>
  Type.Object({ items: Type.Array(item), total: Type.Integer(), page: Type.Integer(), pageSize: Type.Integer() });

export const PlayerList = Page(PlayerListItem);

export const PlayerTotals = Type.Object({
  apps: Type.Integer(),
  goals: Type.Integer(),
  goalsPerMatch: Nullable(Type.Number()),
  ownGoals: Type.Integer(),
  yellow: Type.Integer(),
  red: Type.Integer(),
  cardsPerMatch: Nullable(Type.Number()),
  captain: Type.Integer(),
  wins: Type.Integer(),
  draws: Type.Integer(),
  losses: Type.Integer(),
  winPct: Nullable(Type.Number()),
  hatTricks: Type.Integer(),
});

export const PlayerProfile = Type.Object({
  player: PlayerRef,
  otherNames: Type.Array(Type.String()),
  categories: Type.Array(Category),
  teams: Type.Array(Type.Object({ team: TeamRef, seasons: Type.Array(Type.Integer()), apps: Type.Integer() })),
  firstMatch: Nullable(MatchSummary),
  lastMatch: Nullable(MatchSummary),
  totals: PlayerTotals,
  titles: Type.Array(Type.Object({ tournament: TournamentRef, team: TeamRef })),
  coverage: Coverage,
});

export const PlayerSeasonRow = Type.Object({
  seasonYear: Type.Integer(),
  team: TeamRef,
  category: Category,
  apps: Type.Integer(),
  goals: Type.Integer(),
  yellow: Type.Integer(),
  red: Type.Integer(),
  captain: Type.Integer(),
  wins: Type.Integer(),
  draws: Type.Integer(),
  losses: Type.Integer(),
});

export const PlayerSeasons = Type.Object({ rows: Type.Array(PlayerSeasonRow), totals: PlayerTotals });

export const PlayerMatchRow = Type.Object({
  match: MatchSummary,
  team: TeamRef,
  opponent: TeamRef,
  result: Result,
  goals: Type.Integer(),
  ownGoals: Type.Integer(),
  yellow: Type.Integer(),
  red: Type.Integer(),
  captain: Type.Boolean(),
  shirt: Nullable(Type.Integer()),
});

export const PlayerMatches = Type.Object({ rows: Type.Array(PlayerMatchRow), total: Type.Integer() });

export const Milestone = Type.Object({
  kind: Type.Union([
    Type.Literal('first_match'),
    Type.Literal('first_goal'),
    Type.Literal('apps'),
    Type.Literal('goals'),
    Type.Literal('best_match'),
  ]),
  value: Type.Integer(),
  match: MatchSummary,
  team: TeamRef,
  opponent: TeamRef,
});

export const PlayerMilestones = Type.Object({ milestones: Type.Array(Milestone), hatTricks: Type.Integer() });

export const OpponentRow = Type.Object({
  opponent: TeamRef,
  played: Type.Integer(),
  wins: Type.Integer(),
  draws: Type.Integer(),
  losses: Type.Integer(),
  goals: Type.Integer(),
  yellow: Type.Integer(),
  red: Type.Integer(),
});

export const PlayerOpponents = Type.Object({ rows: Type.Array(OpponentRow) });

export type PlayerListItem = Static<typeof PlayerListItem>;
export type PlayerList = Static<typeof PlayerList>;
export type PlayerTotals = Static<typeof PlayerTotals>;
export type PlayerProfile = Static<typeof PlayerProfile>;
export type PlayerSeasonRow = Static<typeof PlayerSeasonRow>;
export type PlayerSeasons = Static<typeof PlayerSeasons>;
export type PlayerMatchRow = Static<typeof PlayerMatchRow>;
export type PlayerMatches = Static<typeof PlayerMatches>;
export type Milestone = Static<typeof Milestone>;
export type PlayerMilestones = Static<typeof PlayerMilestones>;
export type OpponentRow = Static<typeof OpponentRow>;
export type PlayerOpponents = Static<typeof PlayerOpponents>;
