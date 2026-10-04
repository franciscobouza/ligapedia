// Persistent schemas: never rebuilt by a publish (design D3).
//   raw       verbatim archive of every source response
//   registry  stable public identifiers (URLs must survive daily rebuilds)
//   ops       ingest run history and crawler state
//   meta      the currently published dataset version
import {
  boolean,
  date,
  integer,
  jsonb,
  pgSchema,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const raw = pgSchema('raw');
export const registry = pgSchema('registry');
export const ops = pgSchema('ops');
export const meta = pgSchema('meta');

const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const responses = raw.table('responses', {
  /** endpoint + action + sorted params; see requestKey() */
  key: text('key').primaryKey(),
  endpoint: text('endpoint').notNull(),
  action: text('action').notNull(),
  params: jsonb('params').$type<Record<string, string>>().notNull(),
  status: integer('status').notNull(),
  /** Response body exactly as received. */
  body: text('body').notNull(),
  contentHash: text('content_hash').notNull(),
  firstFetchedAt: tstz('first_fetched_at').notNull().defaultNow(),
  fetchedAt: tstz('fetched_at').notNull().defaultNow(),
  changedAt: tstz('changed_at').notNull().defaultNow(),
});

export const registryPlayers = registry.table('players', {
  id: serial('id').primaryKey(),
  carne: text('carne').notNull().unique(),
  slug: text('slug').notNull(),
  createdAt: tstz('created_at').notNull().defaultNow(),
});

export const registryTeams = registry.table('teams', {
  id: serial('id').primaryKey(),
  key: text('key').notNull().unique(),
  slug: text('slug').notNull(),
  createdAt: tstz('created_at').notNull().defaultNow(),
});

export const registryTournaments = registry.table('tournaments', {
  id: serial('id').primaryKey(),
  key: text('key').notNull().unique(),
  slug: text('slug').notNull(),
  createdAt: tstz('created_at').notNull().defaultNow(),
});

export const registryPhases = registry.table('phases', {
  id: serial('id').primaryKey(),
  key: text('key').notNull().unique(),
  slug: text('slug').notNull(),
  createdAt: tstz('created_at').notNull().defaultNow(),
});

export const ingestRuns = ops.table('ingest_runs', {
  id: serial('id').primaryKey(),
  command: text('command').notNull(),
  /** scheduled | manual */
  trigger: text('trigger').notNull(),
  forced: boolean('forced').notNull().default(false),
  /** running | succeeded | failed | skipped */
  status: text('status').notNull(),
  /** Calendar day in America/Montevideo when the run started. */
  montevideoDate: date('montevideo_date', { mode: 'string' }).notNull(),
  startedAt: tstz('started_at').notNull().defaultNow(),
  finishedAt: tstz('finished_at'),
  datasetVersion: integer('dataset_version'),
  counts: jsonb('counts').$type<Record<string, number>>(),
  report: jsonb('report'),
  error: text('error'),
});

export const seasonVerification = ops.table('season_verification', {
  seasonCode: integer('season_code').primaryKey(),
  verifiedAt: tstz('verified_at').notNull(),
});

export const opsState = ops.table('state', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: tstz('updated_at').notNull().defaultNow(),
});

export const dataset = meta.table('dataset', {
  id: integer('id').primaryKey(),
  version: integer('version').notNull(),
  publishedAt: tstz('published_at'),
  runId: integer('run_id'),
  counts: jsonb('counts').$type<Record<string, number>>(),
});
