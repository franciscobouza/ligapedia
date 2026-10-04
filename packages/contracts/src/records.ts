import { Type, type Static } from 'typebox';
import { Category, Coverage, Kind, MatchSummary, Nullable, PlayerRef, TeamRef, TournamentRef } from './common';

export const PLAYER_METRICS = [
  'goles',
  'goles-por-partido',
  'partidos',
  'amarillas',
  'rojas',
  'tarjetas',
  'tarjetas-por-partido',
  'goles-en-contra',
  'capitan',
  'tripletes',
  'temporadas',
  'titulos',
] as const;
export const TEAM_METRICS = [
  'titulos',
  'victorias',
  'partidos',
  'porcentaje-victorias',
  'porcentaje-puntos',
  'goles',
  'goles-recibidos-por-partido',
  'vallas-invictas',
  'racha-victorias',
  'racha-invicto',
] as const;
export const MATCH_RECORDS = ['goleadas', 'mas-goles', 'empates-con-mas-goles'] as const;

export type PlayerMetric = (typeof PLAYER_METRICS)[number];
export type TeamMetric = (typeof TEAM_METRICS)[number];
export type MatchRecordType = (typeof MATCH_RECORDS)[number];

export const PlayerLeaderRow = Type.Object({
  rank: Type.Integer(),
  player: PlayerRef,
  teams: Type.Array(TeamRef),
  value: Type.Number(),
  apps: Type.Integer(),
});
export const PlayerLeaderboard = Type.Object({
  metric: Type.String(),
  isRatio: Type.Boolean(),
  minMatches: Nullable(Type.Integer()),
  top: Type.Integer(),
  rows: Type.Array(PlayerLeaderRow),
  coverage: Coverage,
});

export const TeamLeaderRow = Type.Object({
  rank: Type.Integer(),
  team: TeamRef,
  value: Type.Number(),
  played: Type.Integer(),
  detail: Type.Array(TournamentRef),
});
export const TeamLeaderboard = Type.Object({
  metric: Type.String(),
  isRatio: Type.Boolean(),
  minMatches: Nullable(Type.Integer()),
  top: Type.Integer(),
  rows: Type.Array(TeamLeaderRow),
});

export const MatchRecordRow = Type.Object({ rank: Type.Integer(), match: MatchSummary, value: Type.Integer() });
export const MatchRecords = Type.Object({ type: Type.String(), top: Type.Integer(), rows: Type.Array(MatchRecordRow) });

export const SingleRecords = Type.Object({
  mostGoalsInMatch: Type.Array(Type.Object({ player: PlayerRef, team: TeamRef, goals: Type.Integer(), match: MatchSummary })),
  mostGoalsInSeason: Type.Array(Type.Object({ player: PlayerRef, seasonYear: Type.Integer(), category: Category, goals: Type.Integer() })),
  mostGoalsInTournament: Type.Array(Type.Object({ player: PlayerRef, tournament: TournamentRef, goals: Type.Integer() })),
  mostRedCardsInMatch: Type.Array(Type.Object({ match: MatchSummary, redCards: Type.Integer() })),
  coverage: Coverage,
});

export const SeasonTopScorers = Type.Object({
  seasons: Type.Array(
    Type.Object({
      seasonYear: Type.Integer(),
      category: Category,
      scorers: Type.Array(Type.Object({ player: PlayerRef, teams: Type.Array(TeamRef), goals: Type.Integer() })),
      attributedShare: Nullable(Type.Number()),
    }),
  ),
});

export const KindFilter = Kind;

export type PlayerLeaderRow = Static<typeof PlayerLeaderRow>;
export type PlayerLeaderboard = Static<typeof PlayerLeaderboard>;
export type TeamLeaderRow = Static<typeof TeamLeaderRow>;
export type TeamLeaderboard = Static<typeof TeamLeaderboard>;
export type MatchRecordRow = Static<typeof MatchRecordRow>;
export type MatchRecords = Static<typeof MatchRecords>;
export type SingleRecords = Static<typeof SingleRecords>;
export type SeasonTopScorers = Static<typeof SeasonTopScorers>;
