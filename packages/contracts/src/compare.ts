import { Type, type Static } from 'typebox';
import { MatchSummary, Nullable, PlayerRef, TeamRef } from './common';
import { PlayerTotals } from './players';

export const TeamComparison = Type.Object({
  a: TeamRef,
  b: TeamRef,
  played: Type.Integer(),
  winsA: Type.Integer(),
  winsB: Type.Integer(),
  draws: Type.Integer(),
  goalsA: Type.Integer(),
  goalsB: Type.Integer(),
  biggestWinA: Nullable(MatchSummary),
  biggestWinB: Nullable(MatchSummary),
  matches: Type.Array(MatchSummary),
});

export const PlayerComparison = Type.Object({
  a: PlayerRef,
  b: PlayerRef,
  opponents: Type.Object({
    played: Type.Integer(),
    winsA: Type.Integer(),
    draws: Type.Integer(),
    lossesA: Type.Integer(),
    goalsA: Type.Integer(),
    goalsB: Type.Integer(),
    matches: Type.Array(Type.Object({ match: MatchSummary, goalsA: Type.Integer(), goalsB: Type.Integer() })),
  }),
  teammates: Type.Object({
    played: Type.Integer(),
    wins: Type.Integer(),
    draws: Type.Integer(),
    losses: Type.Integer(),
    matches: Type.Array(MatchSummary),
  }),
  totalsA: PlayerTotals,
  totalsB: PlayerTotals,
});

export type TeamComparison = Static<typeof TeamComparison>;
export type PlayerComparison = Static<typeof PlayerComparison>;
