# Spec Delta

## Purpose

Show everything the league has published about a single futsal match, with honest handling of missing or placeholder data.

## ADDED Requirements

### Requirement: Match header
The match page SHALL show:
- both teams and the final score;
- date and time in Montevideo time;
- the venue, or "A confirmar" when unknown;
- the season, category, tournament, phase, round and leg.

Teams, tournament and phase SHALL link to their pages.

#### Scenario: Header for a played match
- **WHEN** a visitor opens match 92923
- **THEN** the header shows "UNIVERSIDAD ORT 4 – 6 ALEMAN UNIVERSITARIO", the date 16/05/2025, the venue "G. UGAB", and Temporada 2025 · Masculino · Apertura · Fecha 1

### Requirement: Lineups
The match page SHALL show both teams' lineups with each player's shirt number and a captain marker, and every player SHALL link to their profile. A side without a recorded lineup SHALL show "Sin formación registrada".

#### Scenario: Captain marked
- **WHEN** a lineup entry was published with the captain marker
- **THEN** that player is shown with a "C" badge next to their name

### Requirement: Goals with unattributed remainder
The match page SHALL list each side's recorded goals: goals with unknown minute are grouped per scorer with their count (e.g. "×6"), top scorers first, and goals with a known minute are listed one per line with that minute. Own goals SHALL be marked "(e.c.)" and listed under the side they were credited to. When a side's score exceeds its recorded goals, the page SHALL add a "Gol sin autor registrado" entry with the number of missing goals, so that every side's goal list adds up to its score. A match flagged as inconsistent SHALL show a notice explaining that the recorded goals do not match the published score.

#### Scenario: Missing scorers displayed
- **WHEN** a match ended 12–4 and only 5 home goals have a recorded scorer
- **THEN** the home goal list shows the 5 named goals followed by "Gol sin autor registrado ×7"

#### Scenario: Own goal displayed
- **WHEN** a goal is an own goal by a home player credited to the visitors
- **THEN** it is listed under the visitors' goals with that player's name followed by "(e.c.)"

#### Scenario: Inconsistent match notice
- **WHEN** a match has more recorded goals than its published score
- **THEN** all recorded goals are shown together with the notice "Los goles registrados no coinciden con el resultado oficial"

### Requirement: Cards, substitutions and referees
The match page SHALL list yellow and red cards per side, linked to the player when attributed, or showing the published name when unresolved, together with any published observations. The page SHALL list substitutions with their published minute when any exist. It SHALL list the referees with their roles unless only placeholder referees were published, in which case it SHALL show "Sin datos de árbitros".

#### Scenario: Unresolved card shown
- **WHEN** a red card could not be attributed to a lineup player
- **THEN** it is listed with its published name and without a profile link

#### Scenario: Placeholder referees hidden
- **WHEN** every referee published for a match is the placeholder "A A ,FEDERACION"
- **THEN** the referees section shows "Sin datos de árbitros"

### Requirement: Walk-over and observations
A walk-over match SHALL show a prominent "Partido ganado por W.O." notice naming the winning team. Any published observations SHALL be displayed verbatim.

#### Scenario: Walk-over notice
- **WHEN** a visitor opens walk-over match 55623
- **THEN** the page shows the W.O. notice and the observation "Equipo local (CUBA) no se presenta."

### Requirement: Head-to-head context and source link
The match page SHALL show the all-time record between the two teams (matches, wins for each team, draws) and their last five previous meetings, with a link to the full head-to-head page. It SHALL also link to the match on the league's official site.

#### Scenario: Previous meetings
- **WHEN** a visitor opens a match between two teams that have met 12 times before
- **THEN** the page shows the all-time record across those meetings, the five most recent ones, and a link to the full head-to-head

### Requirement: Scheduled matches
A match without a score SHALL be shown as "Programado", with its date, time and venue, and without goals, cards or a result.

#### Scenario: Upcoming match
- **WHEN** a visitor opens a match that has no published score
- **THEN** the page shows "Programado" and the scheduled date, time and venue
