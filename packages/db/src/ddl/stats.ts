import { ident } from '../connection';

/**
 * `stats` schema: read models rebuilt from `core` on every publish (design D5).
 * Results are from the row's team/player perspective: 'G' (ganado) | 'E' (empate) | 'P' (perdido).
 */
export function statsTablesDDL(schemaName: string): string {
  const s = ident(schemaName);
  const scope = `
  season_code     integer NOT NULL,
  season_year     integer NOT NULL,
  category        char(1) NOT NULL,
  tournament_id   integer NOT NULL,
  tournament_kind text NOT NULL`;
  return `
CREATE SCHEMA ${s};

-- One row per appearance in a played, non-walk-over match.
CREATE TABLE ${s}.player_match (
  match_id      integer NOT NULL,
  player_id     integer NOT NULL,
  team_id       integer NOT NULL,
  opponent_id   integer NOT NULL,
  side          char(1) NOT NULL,${scope},
  phase_id      integer NOT NULL,
  phase_role    text NOT NULL,
  round         integer NOT NULL,
  kickoff       timestamptz,
  kickoff_order integer NOT NULL,
  gf            integer NOT NULL,
  ga            integer NOT NULL,
  result        char(1) NOT NULL,
  goals         integer NOT NULL,
  own_goals     integer NOT NULL,
  yellow        integer NOT NULL,
  red           integer NOT NULL,
  captain       boolean NOT NULL,
  shirt         integer,
  PRIMARY KEY (player_id, match_id)
);

-- Two rows per played match (walk-overs included and flagged).
CREATE TABLE ${s}.team_match (
  match_id      integer NOT NULL,
  team_id       integer NOT NULL,
  opponent_id   integer NOT NULL,
  side          char(1) NOT NULL,${scope},
  phase_id      integer NOT NULL,
  phase_role    text NOT NULL,
  round         integer NOT NULL,
  kickoff       timestamptz,
  kickoff_order integer NOT NULL,
  gf            integer NOT NULL,
  ga            integer NOT NULL,
  result        char(1) NOT NULL,
  points        integer NOT NULL,
  walk_over     boolean NOT NULL,
  clean_sheet   boolean NOT NULL,
  attributed    integer NOT NULL,     -- goals for with a recorded scorer
  yellow        integer NOT NULL,
  red           integer NOT NULL,
  PRIMARY KEY (team_id, match_id)
);

CREATE TABLE ${s}.player_agg (
  player_id     integer NOT NULL,${scope},
  team_id       integer NOT NULL,
  apps          integer NOT NULL,
  goals         integer NOT NULL,
  own_goals     integer NOT NULL,
  yellow        integer NOT NULL,
  red           integer NOT NULL,
  captain       integer NOT NULL,
  wins          integer NOT NULL,
  draws         integer NOT NULL,
  losses        integer NOT NULL,
  hat_tricks    integer NOT NULL,
  team_goals    integer NOT NULL,     -- goals by the player's team in those matches
  team_goals_attributed integer NOT NULL,
  PRIMARY KEY (player_id, tournament_id, team_id)
);

CREATE TABLE ${s}.team_agg (
  team_id       integer NOT NULL,${scope},
  played        integer NOT NULL,
  wins          integer NOT NULL,
  draws         integer NOT NULL,
  losses        integer NOT NULL,
  gf            integer NOT NULL,
  ga            integer NOT NULL,
  points        integer NOT NULL,
  clean_sheets  integer NOT NULL,
  wo_wins       integer NOT NULL,
  wo_losses     integer NOT NULL,
  yellow        integer NOT NULL,
  red           integer NOT NULL,
  PRIMARY KEY (team_id, tournament_id)
);

CREATE TABLE ${s}.team_opponent_agg (
  team_id       integer NOT NULL,
  opponent_id   integer NOT NULL,${scope},
  played        integer NOT NULL,
  wins          integer NOT NULL,
  draws         integer NOT NULL,
  losses        integer NOT NULL,
  gf            integer NOT NULL,
  ga            integer NOT NULL,
  PRIMARY KEY (team_id, opponent_id, tournament_id)
);

CREATE TABLE ${s}.player_opponent_agg (
  player_id     integer NOT NULL,
  opponent_id   integer NOT NULL,${scope},
  apps          integer NOT NULL,
  wins          integer NOT NULL,
  draws         integer NOT NULL,
  losses        integer NOT NULL,
  goals         integer NOT NULL,
  yellow        integer NOT NULL,
  red           integer NOT NULL,
  PRIMARY KEY (player_id, opponent_id, tournament_id)
);

-- Longest and current streaks per team (all tournaments of the team's category).
CREATE TABLE ${s}.streaks (
  team_id         integer NOT NULL,
  kind            text NOT NULL,      -- win|unbeaten|loss|winless
  which           text NOT NULL,      -- longest|current
  length          integer NOT NULL,
  start_match_id  integer,
  end_match_id    integer,
  start_date      timestamptz,
  end_date        timestamptz,
  PRIMARY KEY (team_id, kind, which)
);

CREATE TABLE ${s}.milestones (
  player_id     integer NOT NULL,
  kind          text NOT NULL,        -- first_match|first_goal|apps|goals|best_match
  value         integer NOT NULL,
  match_id      integer NOT NULL,
  team_id       integer NOT NULL,
  opponent_id   integer NOT NULL,
  kickoff       timestamptz,
  PRIMARY KEY (player_id, kind, value)
);

CREATE TABLE ${s}.champions (
  tournament_id integer PRIMARY KEY,
  team_id       integer,
  method        text NOT NULL,        -- override|final|league|undetermined
  season_year   integer NOT NULL,
  category      char(1) NOT NULL,
  kind          text NOT NULL
);

CREATE TABLE ${s}.standings_by_round (
  phase_id      integer NOT NULL,
  after_round   integer NOT NULL,
  position      integer NOT NULL,
  team_id       integer NOT NULL,
  pj integer NOT NULL, pg integer NOT NULL, pe integer NOT NULL, pp integer NOT NULL,
  gf integer NOT NULL, gc integer NOT NULL, pts integer NOT NULL,
  PRIMARY KEY (phase_id, after_round, position)
);

CREATE TABLE ${s}.coverage (${scope},
  matches           integer NOT NULL,
  goals_total       integer NOT NULL,
  goals_attributed  integer NOT NULL,
  yellow_cards      integer NOT NULL,
  red_cards         integer NOT NULL,
  PRIMARY KEY (tournament_id)
);

-- Match-level metrics for match records (walk-overs excluded).
CREATE TABLE ${s}.records_match (
  match_id      integer PRIMARY KEY,${scope},
  total_goals   integer NOT NULL,
  goal_diff     integer NOT NULL,
  winner_goals  integer NOT NULL,
  is_draw       boolean NOT NULL,
  red_cards     integer NOT NULL,
  kickoff_order integer NOT NULL
);

CREATE TABLE ${s}.season_top_scorers (
  season_year   integer NOT NULL,
  category      char(1) NOT NULL,
  player_id     integer NOT NULL,
  goals         integer NOT NULL,
  apps          integer NOT NULL,
  rank          integer NOT NULL,
  PRIMARY KEY (season_year, category, player_id)
);

CREATE TABLE ${s}.search_index (
  id            serial PRIMARY KEY,
  entity_type   text NOT NULL,        -- player|team|tournament
  entity_id     integer NOT NULL,
  slug          text NOT NULL,
  label         text NOT NULL,        -- current display label
  matched_name  text NOT NULL,        -- the name variant this row matches
  context       text NOT NULL,
  norm          text NOT NULL,        -- normalized matched_name (accent/case-free)
  popularity    integer NOT NULL
);
`;
}

export function statsIndexesDDL(schemaName: string): string {
  const s = ident(schemaName);
  return `
CREATE INDEX ON ${s}.player_match (match_id);
CREATE INDEX ON ${s}.player_match (player_id, kickoff_order);
CREATE INDEX ON ${s}.player_match (team_id, season_year);
CREATE INDEX ON ${s}.player_match (opponent_id);
CREATE INDEX ON ${s}.player_match (goals DESC) WHERE goals >= 3;
CREATE INDEX ON ${s}.team_match (team_id, kickoff_order);
CREATE INDEX ON ${s}.team_match (match_id);
CREATE INDEX ON ${s}.team_match (season_year, category);
CREATE INDEX ON ${s}.player_agg (season_year, category, player_id);
CREATE INDEX ON ${s}.player_agg (team_id, season_year);
CREATE INDEX ON ${s}.player_agg (tournament_id);
CREATE INDEX ON ${s}.team_agg (season_year, category, team_id);
CREATE INDEX ON ${s}.team_opponent_agg (opponent_id, team_id);
CREATE INDEX ON ${s}.player_opponent_agg (player_id, season_year);
CREATE INDEX ON ${s}.champions (team_id);
CREATE INDEX ON ${s}.coverage (season_year, category);
CREATE INDEX ON ${s}.records_match (season_year, category);
CREATE INDEX ON ${s}.records_match (goal_diff DESC, winner_goals DESC);
CREATE INDEX ON ${s}.records_match (total_goals DESC);
CREATE INDEX ON ${s}.search_index USING gin (norm gin_trgm_ops);
CREATE INDEX ON ${s}.search_index (entity_type, popularity DESC);
`;
}

export const STATS_TABLES = [
  'champions',
  'coverage',
  'milestones',
  'player_agg',
  'player_match',
  'player_opponent_agg',
  'records_match',
  'search_index',
  'season_top_scorers',
  'standings_by_round',
  'streaks',
  'team_agg',
  'team_match',
  'team_opponent_agg',
] as const;
