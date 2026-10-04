# Spec Delta

## Purpose

Let visitors browse futsal history by season, category, tournament, phase and round. Results, standings and champions are shown for every competition the league has published.

## ADDED Requirements

### Requirement: Season index
The site SHALL list every ingested season from newest to oldest. Each entry SHALL show the year and any dedication name, the categories played, the number of matches and goals, and the champions of that season's tournaments.

#### Scenario: Seasons listed newest first
- **WHEN** a visitor opens the seasons page
- **THEN** 2026 is listed first and 2006 last
- **AND** each season shows its match count, goal count and champions

### Requirement: Season page
For a given season, the site SHALL show:
- its tournaments grouped by category, each with its phases and champion;
- the season's top scorers per category;
- summary figures: matches, goals, goals per match, and the share of goals with a recorded scorer.

#### Scenario: Season overview
- **WHEN** a visitor opens the 2025 season
- **THEN** the page lists the Masculino tournaments (for example Apertura and Clausura), each with its phases and champion, plus the season's top scorers

### Requirement: Tournament page
A tournament page SHALL show:
- its phases in chronological order;
- the standings of each league phase and the matches of each knockout phase;
- the tournament champion;
- the tournament's top scorers;
- summary figures: matches, goals, goals per match, red cards and yellow cards.

#### Scenario: Tournament with league and knockout phases
- **WHEN** a visitor opens the 2025 Masculino Apertura tournament
- **THEN** the page shows the standings of "APERTURA", "APERTURA SERIE 1" and "APERTURA - SERIE 2", followed by the "FINAL DEL APERTURA" match or matches and the resulting champion

### Requirement: Fixtures and results by round
For every phase, the site SHALL list its rounds (fechas) and, for each round, its matches with:
- date and time in Montevideo time;
- venue, or "A confirmar" when unknown;
- home team, score and away team;
- a W.O. badge for walk-overs;
- the label "Programado" for matches without a score.

Each match SHALL link to its match page. A visitor SHALL be able to jump to a specific round.

#### Scenario: Round selection
- **WHEN** a visitor selects round 3 of a phase
- **THEN** only the matches of round 3 of that phase are listed, ordered by date and time

#### Scenario: Walk-over shown in results
- **WHEN** a round contains a walk-over match
- **THEN** that match shows its published score with a "W.O." badge

### Requirement: Standings
For every league phase, the site SHALL show the official standings as published, with these columns: position, team, PJ, PG, PE, PP, GF, GC, DG and Pts. When the source publishes no standings for a league phase, the site SHALL show a table computed from the phase's match results and points, labeled as computed.

The site SHALL also let the visitor view the computed standings as they stood after any given round of the phase. Teams SHALL be ordered by points, then goal difference, then goals for, then team name.

#### Scenario: Official table shown
- **WHEN** a visitor opens the standings of "APERTURA" 2025
- **THEN** the official table is shown with "BOHEMIOS FS" in first place with 11 points

#### Scenario: Missing official standings
- **WHEN** the source returns no standings for a league phase that has played matches
- **THEN** the site shows a computed table labeled "Tabla calculada a partir de los resultados"

#### Scenario: Standings after a given round
- **WHEN** a visitor selects "después de la fecha 2" for a league phase
- **THEN** the computed standings include only matches from rounds 1 and 2

### Requirement: Champions
Every tournament with a determinable winner SHALL show its champion and its tournament kind. The champion SHALL be the first of these that applies:
1. the champion set by a curated override;
2. the winner of the tournament's final phase. Finals may be single matches, two-legged ties or series, so the winner is the team with more wins across the final phase's matches. Equal wins are resolved by aggregate goal difference in those matches.
3. the first-placed team in the standings of the tournament's last league phase, when the tournament has no final phase.

Third-place play-offs SHALL never determine a champion. When no rule yields a winner, the tournament SHALL show "Campeón no determinado". A champions page (palmarés) SHALL list champions by season, category and tournament. It SHALL rank teams by number of titles and SHALL let the visitor filter by tournament kind.

#### Scenario: Champion from a single-match final
- **WHEN** the final phase of a tournament is a single match that team A won 4–2
- **THEN** team A is shown as the tournament champion
- **AND** team A's title count includes that tournament

#### Scenario: Champion from a two-legged final
- **WHEN** a final phase has two matches between teams A and B, and A won the first 5–3 and drew the second 2–2
- **THEN** team A is shown as the tournament champion

#### Scenario: Champion from a league table
- **WHEN** a tournament consists only of league phases
- **THEN** the team in first place in the last league phase's standings is shown as champion

#### Scenario: Undeterminable champion
- **WHEN** each team won one leg of a two-legged final with the same aggregate goal difference, and no override exists
- **THEN** the tournament shows "Campeón no determinado" and no team is credited with that title

#### Scenario: Titles filtered by kind
- **WHEN** a visitor filters the champions ranking to the kind "Copa de Oro / Play-off"
- **THEN** only titles from tournaments of that kind are counted

### Requirement: Category separation
Every competition view SHALL identify the category (Masculino or Femenino) it belongs to. Men's and women's results SHALL never be combined in a single standings table, tournament or champion listing without the category being shown.

#### Scenario: Season with both categories
- **WHEN** a visitor opens the 2019 season, which had both Masculino and Femenino competitions
- **THEN** the tournaments are shown in two groups labeled Masculino and Femenino
