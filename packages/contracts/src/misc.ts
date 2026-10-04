import { Type, type Static } from 'typebox';
import { Category, MatchSummary, Nullable, TournamentRef } from './common';
import { ScorerRow, Standings } from './competitions';

export const SearchResult = Type.Object({
  type: Type.Union([Type.Literal('player'), Type.Literal('team'), Type.Literal('tournament')]),
  id: Type.Integer(),
  slug: Type.String(),
  label: Type.String(),
  matchedName: Type.String(),
  context: Type.String(),
});
export const SearchResults = Type.Object({
  query: Type.String(),
  players: Type.Array(SearchResult),
  teams: Type.Array(SearchResult),
  tournaments: Type.Array(SearchResult),
});

export const Home = Type.Object({
  seasonYear: Nullable(Type.Integer()),
  recentResults: Type.Array(MatchSummary),
  upcoming: Type.Array(MatchSummary),
  standings: Type.Array(Type.Object({ tournament: TournamentRef, phaseName: Type.String(), phaseId: Type.Integer(), standings: Standings })),
  topScorers: Type.Array(Type.Object({ category: Category, scorers: Type.Array(ScorerRow) })),
  highlights: Type.Object({
    allTimeTopScorer: Nullable(Type.Object({ name: Type.String(), id: Type.Integer(), slug: Type.String(), goals: Type.Integer() })),
    mostApps: Nullable(Type.Object({ name: Type.String(), id: Type.Integer(), slug: Type.String(), apps: Type.Integer() })),
    mostTitles: Nullable(Type.Object({ name: Type.String(), id: Type.Integer(), slug: Type.String(), category: Category, titles: Type.Integer() })),
    biggestWin: Nullable(MatchSummary),
  }),
  totals: Type.Object({ seasons: Type.Integer(), matches: Type.Integer(), goals: Type.Integer(), players: Type.Integer(), teams: Type.Integer() }),
});

export const SiteMeta = Type.Object({
  datasetVersion: Type.Integer(),
  publishedAt: Nullable(Type.String()),
  seasons: Type.Array(Type.Object({ year: Type.Integer(), name: Nullable(Type.String()), categories: Type.Array(Category) })),
  kinds: Type.Array(Type.Object({ kind: Type.String(), label: Type.String() })),
  coverage: Type.Object({
    goalsTotal: Type.Integer(),
    goalsAttributed: Type.Integer(),
    attributedShare: Nullable(Type.Number()),
    yellowSeasons: Type.Array(Type.Integer()),
  }),
});

export const Health = Type.Object({
  status: Type.Union([Type.Literal('ok'), Type.Literal('degraded')]),
  db: Type.Union([Type.Literal('ok'), Type.Literal('error')]),
  datasetVersion: Nullable(Type.Integer()),
  publishedAt: Nullable(Type.String()),
  refreshAgeHours: Nullable(Type.Number()),
});

export type SearchResult = Static<typeof SearchResult>;
export type SearchResults = Static<typeof SearchResults>;
export type Home = Static<typeof Home>;
export type SiteMeta = Static<typeof SiteMeta>;
export type Health = Static<typeof Health>;
