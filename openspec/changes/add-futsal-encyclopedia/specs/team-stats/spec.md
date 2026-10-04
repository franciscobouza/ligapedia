# Spec Delta

## Purpose

Give every futsal team a profile with all-time and per-season statistics, form and streaks, club leaders, and head-to-head records against one or all opponents.

## ADDED Requirements

### Requirement: Team directory
The site SHALL list all teams with their category, the seasons they were active, matches played, win percentage and titles. The list SHALL be filterable by category and season, and sortable by each of those columns.

#### Scenario: Women's teams only
- **WHEN** a visitor filters the team list by category Femenino
- **THEN** only women's teams are listed

### Requirement: Team profile summary
A team profile SHALL show:
- matches played, wins, draws and losses, and win percentage;
- points percentage (points obtained divided by points possible);
- goals for, goals against and goal difference, with per-match averages;
- clean sheets (matches without conceding);
- walk-over wins and losses;
- titles;
- seasons participated;
- the first and last match.

Totals SHALL use published scores, including walk-overs. Each walk-over SHALL be counted and labeled as such.

#### Scenario: Win percentage and points percentage
- **WHEN** a team has 100 matches with 50 wins, 20 draws and 30 losses
- **THEN** the profile shows 50% wins and a points percentage of 56.7% (170 of 300 possible points)

### Requirement: Form and streaks
A team profile SHALL show:
- the last five results (form) and the current streak;
- the longest winning streak, the longest unbeaten streak and the longest losing streak, each with its start and end dates;
- the biggest win, the biggest loss and the highest-scoring match.

Streaks SHALL follow chronological match order across all tournaments of the team's category. Biggest-result records SHALL exclude walk-overs.

#### Scenario: Current streak
- **WHEN** a team's last four matches were wins and the one before was a draw
- **THEN** the profile shows a current streak of 4 wins and a form of G-G-G-G-E (newest first)

### Requirement: Per-season history
A team profile SHALL include one row per season, showing the tournaments played, the final position in each league phase, wins, draws and losses, goals for and against, and the team's top scorer that season. It SHALL also show charts of results per season and goals per season.

#### Scenario: Season row
- **WHEN** a team finished 2nd in "APERTURA" 2025
- **THEN** the 2025 row shows position 2 for that phase together with the season totals

### Requirement: Squads per season
A team profile SHALL list, for any selected season, every player who appeared for the team, with appearances, goals, cards and captaincies.

#### Scenario: Squad of a season
- **WHEN** a visitor selects season 2025 on a team profile
- **THEN** every player who appeared for that team in 2025 is listed with their 2025 figures

### Requirement: Club all-time leaders
A team profile SHALL show the team's all-time leaders for goals, appearances, red cards, yellow cards and captaincies, counting only matches played for that team.

#### Scenario: Club top scorer
- **WHEN** a player scored the most attributed goals for a team across all seasons
- **THEN** that player heads the team's "Máximos goleadores" list with that number of goals

### Requirement: Team versus team
A visitor SHALL be able to compare any two teams of the same category. The comparison SHALL show:
- matches played, wins for each team, draws, and each team's goals;
- the biggest win of each team over the other;
- the full list of their matches.

The comparison SHALL be filterable by season range and tournament. When the teams never met, the page SHALL say so.

#### Scenario: Head-to-head summary
- **WHEN** two teams met 15 times, with team A winning 8, team B winning 4 and 3 draws
- **THEN** the comparison shows 15 matches, 8 wins for A, 4 wins for B and 3 draws, and lists all 15 matches newest first

#### Scenario: Filtered head-to-head
- **WHEN** the visitor restricts the comparison to the seasons 2020–2025
- **THEN** only matches from those seasons are counted and listed

### Requirement: Team versus all teams
A team profile SHALL include a table of every opponent the team has faced. Each row SHALL show matches, wins, draws, losses, goals for, goals against, goal difference and win percentage. The table SHALL be sortable by any column and filterable by season range and tournament.

#### Scenario: All-opponents table
- **WHEN** a visitor opens a team's "vs todos" view
- **THEN** each opponent appears once
- **AND** the sum of the matches column equals the team's total matches under the same filters
