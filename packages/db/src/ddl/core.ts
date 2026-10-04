import { ident } from '../connection';

/**
 * `core` schema: the normalized dataset, rebuilt from the raw archive on every publish
 * into a fresh schema (usually `core_next`) and swapped in atomically (design D4).
 *
 * Categories: 'M' (Masculino) | 'F' (Femenino). Sides: 'H' (home/locatario) | 'A' (away/visitante).
 */
export function coreTablesDDL(schemaName: string): string {
  const s = ident(schemaName);
  return `
CREATE SCHEMA ${s};

CREATE TABLE ${s}.seasons (
  code        integer PRIMARY KEY,
  year        integer NOT NULL UNIQUE,
  name        text,                      -- dedication published by the source, if any
  sport       text NOT NULL
);

CREATE TABLE ${s}.tournaments (
  id          integer PRIMARY KEY,       -- registry.tournaments.id
  key         text NOT NULL UNIQUE,
  slug        text NOT NULL,
  sport       text NOT NULL,
  season_code integer NOT NULL REFERENCES ${s}.seasons(code),
  season_year integer NOT NULL,
  category    char(1) NOT NULL CHECK (category IN ('M','F')),
  kind        text NOT NULL,             -- apertura|clausura|liga|oro|plata|anual|otro
  name        text NOT NULL,
  sort_order  integer NOT NULL,
  start_date  date,
  end_date    date
);

CREATE TABLE ${s}.phases (
  id              integer PRIMARY KEY,   -- registry.phases.id
  key             text NOT NULL UNIQUE,
  slug            text NOT NULL,
  tournament_id   integer NOT NULL REFERENCES ${s}.tournaments(id),
  season_code     integer NOT NULL,
  season_year     integer NOT NULL,
  category        char(1) NOT NULL,
  source_torneo   text NOT NULL,
  source_serie    text NOT NULL,
  name            text NOT NULL,
  role            text NOT NULL,         -- league|knockout|final|third_place
  sort_order      integer NOT NULL,
  start_date      date,
  end_date        date,
  has_official_standings boolean NOT NULL DEFAULT false
);

CREATE TABLE ${s}.rounds (
  phase_id    integer NOT NULL REFERENCES ${s}.phases(id),
  round       integer NOT NULL,
  start_date  date,
  end_date    date,
  match_count integer NOT NULL,
  PRIMARY KEY (phase_id, round)
);

CREATE TABLE ${s}.teams (
  id            integer PRIMARY KEY,     -- registry.teams.id
  key           text NOT NULL UNIQUE,
  slug          text NOT NULL,
  category      char(1) NOT NULL,
  name          text NOT NULL,           -- canonical published name
  display_name  text NOT NULL
);

CREATE TABLE ${s}.team_names (
  team_id     integer NOT NULL REFERENCES ${s}.teams(id),
  name        text NOT NULL,
  PRIMARY KEY (team_id, name)
);

CREATE TABLE ${s}.venues (
  id            integer PRIMARY KEY,
  name          text NOT NULL UNIQUE,
  display_name  text NOT NULL
);

CREATE TABLE ${s}.players (
  id            integer PRIMARY KEY,     -- registry.players.id
  carne         text NOT NULL UNIQUE,    -- never exposed by the API
  slug          text NOT NULL,
  name          text NOT NULL,           -- most recent published name
  display_name  text NOT NULL
);

CREATE TABLE ${s}.player_names (
  player_id     integer NOT NULL REFERENCES ${s}.players(id),
  name          text NOT NULL,
  display_name  text NOT NULL,
  first_year    integer NOT NULL,
  last_year     integer NOT NULL,
  PRIMARY KEY (player_id, name)
);

CREATE TABLE ${s}.matches (
  id                 integer PRIMARY KEY,   -- source match ID
  season_code        integer NOT NULL,
  season_year        integer NOT NULL,
  category           char(1) NOT NULL,
  tournament_id      integer NOT NULL REFERENCES ${s}.tournaments(id),
  phase_id           integer NOT NULL REFERENCES ${s}.phases(id),
  round              integer NOT NULL,
  leg                integer,
  match_number       integer,
  kickoff            timestamptz,           -- listing Fecha_Hora, America/Montevideo
  kickoff_order      integer NOT NULL,      -- global chronological rank (season year, kickoff, id)
  details_start      text,                  -- details Fecha_Inicio, verbatim
  details_end        text,                  -- details Fecha_fin, verbatim
  venue_id           integer REFERENCES ${s}.venues(id),
  home_team_id       integer NOT NULL REFERENCES ${s}.teams(id),
  away_team_id       integer NOT NULL REFERENCES ${s}.teams(id),
  home_goals         integer,
  away_goals         integer,
  home_points        integer,
  away_points        integer,
  status             text NOT NULL,         -- jugado|programado
  walk_over          boolean NOT NULL DEFAULT false,
  inconsistent       boolean NOT NULL DEFAULT false,
  doubtful_date      boolean NOT NULL DEFAULT false,
  home_unattributed  integer NOT NULL DEFAULT 0,
  away_unattributed  integer NOT NULL DEFAULT 0,
  observations       text
);

CREATE TABLE ${s}.appearances (
  match_id    integer NOT NULL REFERENCES ${s}.matches(id),
  player_id   integer NOT NULL REFERENCES ${s}.players(id),
  team_id     integer NOT NULL REFERENCES ${s}.teams(id),
  side        char(1) NOT NULL,
  shirt       integer,
  captain     boolean NOT NULL DEFAULT false,
  seq         integer NOT NULL,
  PRIMARY KEY (match_id, player_id)
);

CREATE TABLE ${s}.goals (
  id          integer PRIMARY KEY,
  match_id    integer NOT NULL REFERENCES ${s}.matches(id),
  side        char(1) NOT NULL,             -- side the goal is credited to
  team_id     integer NOT NULL,             -- team credited with the goal
  player_id   integer REFERENCES ${s}.players(id),
  minute      integer,                      -- verbatim
  own_goal    boolean NOT NULL DEFAULT false,
  seq         integer NOT NULL
);

CREATE TABLE ${s}.cards (
  id            integer PRIMARY KEY,
  match_id      integer NOT NULL REFERENCES ${s}.matches(id),
  side          char(1) NOT NULL,
  team_id       integer NOT NULL,
  color         char(1) NOT NULL CHECK (color IN ('Y','R')),
  player_id     integer REFERENCES ${s}.players(id),
  raw_name      text NOT NULL,
  observations  text,
  seq           integer NOT NULL
);

CREATE TABLE ${s}.substitutions (
  match_id    integer NOT NULL REFERENCES ${s}.matches(id),
  side        char(1) NOT NULL,
  player_out  text,
  player_in   text,
  minute      integer,
  seq         integer NOT NULL,
  PRIMARY KEY (match_id, side, seq)
);

CREATE TABLE ${s}.officials (
  match_id    integer NOT NULL REFERENCES ${s}.matches(id),
  role        text NOT NULL,
  name        text NOT NULL,
  seq         integer NOT NULL,
  PRIMARY KEY (match_id, seq)
);

CREATE TABLE ${s}.standings_official (
  phase_id    integer NOT NULL REFERENCES ${s}.phases(id),
  position    integer NOT NULL,
  team_id     integer NOT NULL REFERENCES ${s}.teams(id),
  pj integer NOT NULL, pg integer NOT NULL, pe integer NOT NULL, pp integer NOT NULL,
  gf integer NOT NULL, gc integer NOT NULL, pts integer NOT NULL,
  PRIMARY KEY (phase_id, position)
);
`;
}

/** Secondary indexes, created after the bulk load (faster than maintaining them while loading). */
export function coreIndexesDDL(schemaName: string): string {
  const s = ident(schemaName);
  return `
CREATE INDEX ON ${s}.tournaments (season_year, category);
CREATE INDEX ON ${s}.phases (tournament_id, sort_order);
CREATE INDEX ON ${s}.matches (phase_id, round, kickoff);
CREATE INDEX ON ${s}.matches (tournament_id);
CREATE INDEX ON ${s}.matches (season_year, category);
CREATE INDEX ON ${s}.matches (home_team_id, kickoff_order);
CREATE INDEX ON ${s}.matches (away_team_id, kickoff_order);
CREATE INDEX ON ${s}.matches (kickoff_order);
CREATE INDEX ON ${s}.appearances (player_id);
CREATE INDEX ON ${s}.appearances (team_id);
CREATE INDEX ON ${s}.goals (match_id, seq);
CREATE INDEX ON ${s}.goals (player_id);
CREATE INDEX ON ${s}.cards (match_id, seq);
CREATE INDEX ON ${s}.cards (player_id);
CREATE INDEX ON ${s}.player_names (player_id);
CREATE INDEX ON ${s}.team_names (team_id);
`;
}

export const CORE_TABLES = [
  'appearances',
  'cards',
  'goals',
  'matches',
  'officials',
  'phases',
  'player_names',
  'players',
  'rounds',
  'seasons',
  'standings_official',
  'substitutions',
  'team_names',
  'teams',
  'tournaments',
  'venues',
] as const;
