# Spec Delta

## Purpose

Provide filterable top-X leaderboards and historical record lists for players, teams and matches. Ranking rules are fair, and the site is transparent about the source's coverage gaps.

## ADDED Requirements

### Requirement: Player leaderboards
The site SHALL provide player leaderboards for:
- goals and goals per match;
- appearances;
- yellow cards, red cards and total cards;
- cards per match;
- own goals and captaincies;
- matches with three or more goals;
- seasons played;
- titles.

Every leaderboard SHALL support:
- top 10, 25, 50 or 100;
- a single season or a year range;
- category, tournament and team filters.

Each entry SHALL link to the player's profile and show the player's team(s) within the filtered scope.

#### Scenario: Top scorers of a year range
- **WHEN** a visitor opens the goals leaderboard filtered to Masculino, 2015–2020, top 25
- **THEN** at most 25 players are listed, ordered by attributed goals in Masculino matches from 2015 to 2020

#### Scenario: Most red cards for one team
- **WHEN** a visitor opens the red cards leaderboard filtered by team "UNIVERSIDAD ORT"
- **THEN** players are ranked by red cards received while playing for that team

### Requirement: Ranking order and ties
Leaderboards SHALL rank by the selected metric in descending order. Ties SHALL be broken by fewer appearances, then by display name alphabetically. Tied entries SHALL share the same rank number.

#### Scenario: Tied scorers
- **WHEN** two players both have 40 goals, one in 50 matches and the other in 60
- **THEN** both show rank 1, and the player with 50 matches is listed first

### Requirement: Minimum sample for ratio rankings
Ratio leaderboards (goals per match, cards per match, win percentage, points percentage) SHALL include only entries that reach a minimum number of matches in the filtered scope. The minimum SHALL default to 10 matches for players and 20 matches for teams. The visitor SHALL be able to change it, and the minimum in use SHALL be shown.

#### Scenario: Default minimum applied
- **WHEN** a visitor opens the cards-per-match leaderboard without changing the minimum
- **THEN** players with fewer than 10 appearances in the filtered scope are excluded
- **AND** the page states "Mínimo 10 partidos"

#### Scenario: Visitor lowers the minimum
- **WHEN** the visitor sets the minimum to 3 matches
- **THEN** players with 3 or more appearances are ranked

### Requirement: Single-match and season records
The site SHALL list the following records:
- the most goals by a player in a single match;
- the most goals by a player in a season and in a tournament;
- the top scorer of every season and category;
- the most red cards in a single match (both teams combined).

Each record SHALL link to the relevant match, season or tournament.

#### Scenario: Top scorer per season
- **WHEN** a visitor opens "Goleadores por temporada"
- **THEN** every season and category with attributed goals lists its top scorer or scorers with their goal count

### Requirement: Team leaderboards
The site SHALL provide team leaderboards for:
- titles, wins and matches played;
- win percentage and points percentage;
- goals scored, goals conceded per match and clean sheets;
- the longest winning streak and the longest unbeaten streak.

Team leaderboards SHALL support category, season or year-range and tournament filters. The titles leaderboard SHALL also support a tournament-kind filter.

#### Scenario: Most titles
- **WHEN** a visitor opens the titles leaderboard for Masculino
- **THEN** teams are ranked by the number of tournaments they won, and each entry lists those titles with their tournament kind

### Requirement: Match records
The site SHALL list the biggest wins (by goal difference, then goals scored), the highest-scoring matches and the highest-scoring draws. Walk-overs SHALL be excluded. The lists SHALL support category, season or year-range and tournament filters.

#### Scenario: Walk-overs excluded
- **WHEN** a walk-over ended 3–0
- **THEN** it does not appear in any match record list

### Requirement: Coverage notices on records
Leaderboards and records based on goals or cards SHALL show a coverage notice computed for the active filters:
- for goal-based lists, the percentage of goals in scope that have a recorded scorer;
- for yellow-card lists, the seasons in scope that contain any recorded yellow card.

#### Scenario: Goal coverage notice
- **WHEN** 62% of the goals within the active filters have a recorded scorer
- **THEN** the goals leaderboard shows "El 62% de los goles de este filtro tienen autor registrado"

#### Scenario: Sparse yellow cards
- **WHEN** the active filters cover seasons in which no yellow card was recorded
- **THEN** the yellow cards leaderboard states which seasons in the filter contain recorded yellow cards
