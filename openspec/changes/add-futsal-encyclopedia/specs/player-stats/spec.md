# Spec Delta

## Purpose

Give every futsal player who appears in the league's records a profile with career statistics, history and head-to-head comparisons against other players and teams.

## ADDED Requirements

### Requirement: Player directory
The site SHALL provide a paginated player list. Each entry SHALL show the display name, the teams played for, the active years, appearances and goals. The list SHALL be sortable by appearances, goals and name, and filterable by season or year range, category and team.

#### Scenario: Filter players by team and season
- **WHEN** a visitor filters the player list by team "UNIVERSIDAD ORT" and season 2025
- **THEN** only players who appeared for that team in 2025 are listed, with their 2025 appearances and goals

### Requirement: Player profile summary
A player profile SHALL show:
- the display name and any other published names;
- the teams played for, with their seasons;
- the first and last match;
- career totals:
  - appearances (PJ);
  - goals and goals per match;
  - own goals;
  - yellow cards, red cards and cards per match;
  - matches as captain;
  - wins, draws and losses in matches the player appeared in, with win percentage;
  - titles: tournaments in which the player appeared for the champion team.

Walk-overs SHALL be excluded, and unattributed goals SHALL NOT count for any player. The membership card number SHALL NOT be displayed.

#### Scenario: Career totals
- **WHEN** a visitor opens the profile of a player with 120 appearances, 85 attributed goals and 2 red cards
- **THEN** the profile shows PJ 120, Goles 85, Goles por partido 0.71 and Rojas 2

#### Scenario: Card number hidden
- **WHEN** any player profile is displayed
- **THEN** neither the page nor its URL contains the player's membership card number

### Requirement: Per-season and per-team breakdowns
A player profile SHALL include a table with one row per season and team. Each row SHALL show the category, appearances, goals, cards, captaincies and win/draw/loss record, and the table SHALL end with a career totals row.

#### Scenario: Player who changed teams
- **WHEN** a player appeared for team A in 2018–2020 and team B in 2021
- **THEN** the breakdown shows separate rows for each season with the team of that season

### Requirement: Match log
A player profile SHALL list every match the player appeared in. Each match SHALL show the date, the player's team and the opponent, the score, the result from the player's perspective, the goals scored and any cards. The match log SHALL be filterable by season, tournament, team and opponent, and every match SHALL link to its match page.

#### Scenario: Filter log by opponent
- **WHEN** a visitor filters a player's match log by opponent "BOHEMIOS FS"
- **THEN** only matches in which the player faced that team are listed

### Requirement: Milestones
A player profile SHALL show the player's milestones:
- the first match and the first goal;
- every 50th appearance and every 50th goal;
- the best single-match scoring performance;
- the number of matches with three or more goals.

#### Scenario: Hundredth appearance
- **WHEN** a player has 130 appearances
- **THEN** the milestones include the matches of the 50th and 100th appearances, with date and opponent

### Requirement: Player versus player
A visitor SHALL be able to compare a player with any other player. The comparison SHALL show:
- **As opponents** (matches where both appeared on opposite teams): the number of matches, wins, draws and losses from the first player's perspective, each player's goals in those matches, and the match list.
- **As teammates** (matches where both appeared for the same team): the number of matches and the team's wins, draws and losses.
- **Career totals** of both players side by side.

When the players never met, the page SHALL say so.

#### Scenario: Players who faced each other
- **WHEN** a visitor compares player A with player B, who were on opposite teams in 7 matches (A's team won 4, drew 1, lost 2)
- **THEN** the comparison shows 7 matches with 4 wins, 1 draw and 2 losses for player A, plus both players' goals in those 7 matches

#### Scenario: Players who never met
- **WHEN** two compared players never appeared in the same match
- **THEN** the comparison states "No coincidieron en ningún partido" and still shows both players' career totals

### Requirement: Player versus teams
A player profile SHALL include a table of every opponent team the player faced, with matches, wins, draws, losses, goals and cards against that team, sortable by any column. A visitor SHALL also be able to select one opponent team and see the matching match list.

#### Scenario: Record against all teams
- **WHEN** a visitor opens the "vs equipos" view of a player
- **THEN** every opponent team the player faced is listed once
- **AND** the sum of the matches column equals the player's total appearances

### Requirement: Data coverage notice for players
Player statistics that depend on incomplete source data SHALL show a notice. For goals, the notice SHALL give the share of goals with a recorded scorer in the player's matches; for yellow cards, it SHALL state the seasons in which yellow cards were recorded.

#### Scenario: Partially attributed career
- **WHEN** only 60% of the goals scored by the player's teams in their matches have a recorded scorer
- **THEN** the goals statistic shows a notice that 40% of those goals have no recorded scorer
