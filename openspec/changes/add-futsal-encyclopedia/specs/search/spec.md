# Spec Delta

## Purpose

Let visitors find any player, team or tournament instantly, and query every listing by year, tournament, category, team or player using filters that can be shared as links.

## ADDED Requirements

### Requirement: Global search
Every page SHALL provide a search box that can also be opened with the "/" key or Ctrl/Cmd+K. The search SHALL show results while the visitor types, grouped into Jugadores, Equipos and Torneos. Matching SHALL:
- ignore case and accents;
- match partial words;
- accept name tokens in any order;
- tolerate minor misspellings;
- include every published name variant of a player.

Each result SHALL show disambiguating context: teams and years for players, category for teams, and season for tournaments.

#### Scenario: Accent-insensitive team search
- **WHEN** a visitor types "nautico"
- **THEN** teams whose published name contains "NÁUTICO" or "NAUTICO" are listed under Equipos

#### Scenario: Tokens in any order
- **WHEN** a visitor types "perez juan"
- **THEN** a player published as "JUAN PABLO PEREZ" is among the results

#### Scenario: Minor misspelling
- **WHEN** a visitor types "hebraika"
- **THEN** "HEBRAICA UNIVERSITARIO" is among the team results

#### Scenario: Previous name variant
- **WHEN** a visitor searches for a name that a player used only in earlier seasons
- **THEN** that player is found, and the result shows the current display name

### Requirement: Search responsiveness
The search SHALL return results for any query of two or more characters within 100 ms of server processing time at the 95th percentile, and SHALL return at most 10 results per group.

#### Scenario: Two-character query
- **WHEN** a visitor types "ba"
- **THEN** at most 10 players, 10 teams and 10 tournaments are returned

### Requirement: Shareable filter state
Every list, statistics and comparison page SHALL keep its filters in the page URL. Filters include:
- season or year range;
- category, tournament and phase;
- team, opponent and player;
- top N;
- minimum matches;
- sorting.

Opening a copied URL SHALL reproduce the same view, and the browser's back and forward buttons SHALL restore earlier filter states.

#### Scenario: Shared leaderboard link
- **WHEN** a visitor copies the URL of the goals leaderboard filtered to Femenino, 2014–2019, top 50 and opens it in a new browser
- **THEN** the same leaderboard with the same filters is shown

#### Scenario: Back button restores filters
- **WHEN** a visitor changes the season filter from 2024 to 2025 and presses the browser back button
- **THEN** the page shows the 2024 view again

### Requirement: Consistent and forgiving filters
Pages with the same filter dimensions SHALL use the same filter controls and the same URL parameter names. Unknown or invalid filter values SHALL be ignored, falling back to the default for that filter, and SHALL NOT produce an error page.

#### Scenario: Invalid season in URL
- **WHEN** a visitor opens a leaderboard URL with the season set to 1990
- **THEN** the leaderboard is shown with the default season scope, and a note says the requested season does not exist
