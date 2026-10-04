import { Type, type Static, type TSchema } from 'typebox';

export const Nullable = <T extends TSchema>(t: T) => Type.Union([t, Type.Null()]);

export const Category = Type.Union([Type.Literal('M'), Type.Literal('F')]);
export const Kind = Type.Union([
  Type.Literal('apertura'),
  Type.Literal('clausura'),
  Type.Literal('liga'),
  Type.Literal('oro'),
  Type.Literal('plata'),
  Type.Literal('anual'),
  Type.Literal('otro'),
]);
export const Role = Type.Union([
  Type.Literal('league'),
  Type.Literal('knockout'),
  Type.Literal('final'),
  Type.Literal('third_place'),
]);
export const Result = Type.Union([Type.Literal('G'), Type.Literal('E'), Type.Literal('P')]);

export const TeamRef = Type.Object({ id: Type.Integer(), slug: Type.String(), name: Type.String(), category: Category });
export const PlayerRef = Type.Object({ id: Type.Integer(), slug: Type.String(), name: Type.String() });
export const TournamentRef = Type.Object({
  id: Type.Integer(),
  slug: Type.String(),
  name: Type.String(),
  seasonYear: Type.Integer(),
  category: Category,
  kind: Kind,
});
export const PhaseRef = Type.Object({ id: Type.Integer(), slug: Type.String(), name: Type.String(), role: Role });

export const MatchSummary = Type.Object({
  id: Type.Integer(),
  /** ISO 8601 instant; display in America/Montevideo. */
  kickoff: Nullable(Type.String()),
  doubtfulDate: Type.Boolean(),
  round: Type.Integer(),
  status: Type.Union([Type.Literal('jugado'), Type.Literal('programado')]),
  home: TeamRef,
  away: TeamRef,
  homeGoals: Nullable(Type.Integer()),
  awayGoals: Nullable(Type.Integer()),
  walkOver: Type.Boolean(),
  venue: Nullable(Type.String()),
  tournament: TournamentRef,
  phase: PhaseRef,
});

/** W/D/L record block. */
export const Record_ = Type.Object({
  played: Type.Integer(),
  wins: Type.Integer(),
  draws: Type.Integer(),
  losses: Type.Integer(),
});

export const Meta = Type.Object({
  datasetVersion: Type.Integer(),
  /** Filters that were ignored because their value was invalid (spec search "forgiving filters"). */
  ignoredFilters: Type.Array(Type.String()),
});

export const Envelope = <T extends TSchema>(data: T) => Type.Object({ data, meta: Meta });

export const Coverage = Type.Object({
  goalsTotal: Type.Integer(),
  goalsAttributed: Type.Integer(),
  /** Share of goals with a recorded scorer, 0–1 (null when there are no goals). */
  attributedShare: Nullable(Type.Number()),
  /** Seasons in scope with at least one recorded yellow card. */
  yellowSeasons: Type.Array(Type.Integer()),
});

export const ErrorBody = Type.Object({ error: Type.String(), message: Type.String() });

export type Category = Static<typeof Category>;
export type Kind = Static<typeof Kind>;
export type Role = Static<typeof Role>;
export type Result = Static<typeof Result>;
export type TeamRef = Static<typeof TeamRef>;
export type PlayerRef = Static<typeof PlayerRef>;
export type TournamentRef = Static<typeof TournamentRef>;
export type PhaseRef = Static<typeof PhaseRef>;
export type MatchSummary = Static<typeof MatchSummary>;
export type WdlRecord = Static<typeof Record_>;
export type Meta = Static<typeof Meta>;
export type Coverage = Static<typeof Coverage>;
