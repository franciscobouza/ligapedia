import { Type, type Static } from 'typebox';
import { MatchSummary, Nullable, PlayerRef, TeamRef } from './common';

const Side = Type.Union([Type.Literal('H'), Type.Literal('A')]);

export const MatchDetail = Type.Object({
  match: MatchSummary,
  leg: Nullable(Type.Integer()),
  matchNumber: Nullable(Type.Integer()),
  inconsistent: Type.Boolean(),
  observations: Nullable(Type.String()),
  lineups: Type.Object({
    home: Type.Array(Type.Object({ player: PlayerRef, shirt: Nullable(Type.Integer()), captain: Type.Boolean() })),
    away: Type.Array(Type.Object({ player: PlayerRef, shirt: Nullable(Type.Integer()), captain: Type.Boolean() })),
  }),
  /** Recorded goals per credited side; unattributed counts complete each side up to its score. */
  goals: Type.Array(
    Type.Object({ side: Side, player: Nullable(PlayerRef), minute: Nullable(Type.Integer()), ownGoal: Type.Boolean() }),
  ),
  unattributed: Type.Object({ home: Type.Integer(), away: Type.Integer() }),
  cards: Type.Array(
    Type.Object({
      side: Side,
      color: Type.Union([Type.Literal('Y'), Type.Literal('R')]),
      player: Nullable(PlayerRef),
      name: Type.String(),
      observations: Nullable(Type.String()),
    }),
  ),
  substitutions: Type.Array(
    Type.Object({ side: Side, playerOut: Nullable(Type.String()), playerIn: Nullable(Type.String()), minute: Nullable(Type.Integer()) }),
  ),
  referees: Type.Array(Type.Object({ role: Type.String(), name: Type.String() })),
  headToHead: Type.Object({
    matches: Type.Integer(),
    homeWins: Type.Integer(),
    awayWins: Type.Integer(),
    draws: Type.Integer(),
    previous: Type.Array(MatchSummary),
  }),
  officialUrl: Type.String(),
  winner: Nullable(TeamRef),
});

export type MatchDetail = Static<typeof MatchDetail>;
