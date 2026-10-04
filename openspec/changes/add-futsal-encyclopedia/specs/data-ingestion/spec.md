# Spec Delta

## Purpose

Acquire the complete Liga Universitaria de Deportes futsal history from the league's public endpoints and normalize it into one consistent, queryable dataset. Explicit rules cover the source's known gaps and quirks.

## ADDED Requirements

### Requirement: Futsal source coverage
The system SHALL ingest, from the league's public match-detail endpoints and historical-standings endpoints, every season that lists the FUTSAL sport. For each such season it SHALL ingest every tournament label listed under FUTSAL, every series (phase), every round (fecha) and every match. For each match it SHALL ingest the match details, referees, both lineups, both sides' substitutions, goals, yellow cards (amonestados) and red cards (expulsados). It SHALL also ingest the official standings of every series. Data from any other sport SHALL NOT be stored as part of the futsal dataset.

#### Scenario: Full backfill covers all futsal seasons
- **WHEN** a full backfill completes
- **THEN** the dataset contains every season for which the source lists FUTSAL (currently source codes 93–113)
- **AND** it contains every match ID that the source lists under FUTSAL for those seasons

#### Scenario: Other sports are ignored
- **WHEN** the source lists FÚTBOL, BASQUETBOL or any other non-FUTSAL sport for a season
- **THEN** no tournaments, matches, players or standings from that sport are stored or shown

#### Scenario: Women's competition is included
- **WHEN** a season lists the tournament label "Mayores Femenino" under FUTSAL
- **THEN** its phases, matches, lineups and events are ingested and tagged with the category Femenino

### Requirement: Raw response archive
The system SHALL store every source response verbatim, together with its endpoint, request parameters, fetch timestamp and a content hash. Normalization SHALL be re-runnable entirely from the archive.

#### Scenario: Re-normalization without network access
- **WHEN** an operator re-runs normalization for the whole history
- **THEN** it completes using archived responses only, without sending any request to the source

#### Scenario: Unchanged responses are detected
- **WHEN** a re-fetched response has the same content hash as the archived one
- **THEN** the records derived from it are not rewritten
- **AND** the change is not counted as an update in the run report

### Requirement: Polite and resilient fetching
The fetcher SHALL limit concurrent source requests to a configurable maximum, defaulting to 4. Every request SHALL carry a User-Agent that identifies Ligapedia and a contact. The fetcher SHALL retry network errors, timeouts, HTTP 5xx responses and unparseable bodies with exponential backoff, up to a configurable number of attempts. An HTTP 200 response whose body is empty or a JSON object with an `error` key SHALL be treated as "no records" rather than as a failure. The source answers the referees action (`jueces`) with HTTP 500 and an empty body when a match has no referees; that response SHALL also be treated as "no records", without retrying.

#### Scenario: Referees action without referees
- **WHEN** the source answers `jueces` for match 92923 with HTTP 500 and an empty body
- **THEN** the match is recorded as having no referees, the request is not retried, and it counts as successful

#### Scenario: Error body means empty list
- **WHEN** the source answers HTTP 200 with `{"error":"No se encontraron amonestados para el equipo locatario del partido con ID: 92923"}`
- **THEN** match 92923 is recorded as having zero yellow cards for the home side
- **AND** the request counts as successful

#### Scenario: Transient failure is retried
- **WHEN** a source request times out or returns HTTP 503
- **THEN** it is retried with increasing delays up to the configured attempt limit
- **AND** if every attempt fails, the item is recorded as failed in the run report and the rest of the run continues

#### Scenario: Concurrency cap is respected
- **WHEN** an ingest run is in progress with the default configuration
- **THEN** no more than 4 requests to the source are in flight at any moment

### Requirement: Resumable full backfill
An operator SHALL be able to run a full historical backfill on demand. An interrupted backfill SHALL resume without re-requesting responses that were already archived successfully during that backfill.

#### Scenario: Interrupted backfill resumes
- **WHEN** a backfill is interrupted after archiving the details of 1,200 matches and is started again
- **THEN** those 1,200 matches are not requested again
- **AND** the backfill continues with the remaining items until the history is complete

### Requirement: Season identification
Each season SHALL be identified by its source code and its calendar year. The year SHALL be taken from the "Año YYYY" text in the match details when present, and otherwise derived as source code + 1913. Any season dedication text published by the source SHALL be preserved as the season's display name.

#### Scenario: Oldest futsal season
- **WHEN** season code 93 is ingested
- **THEN** it is stored as year 2006

#### Scenario: Dedicated season
- **WHEN** season code 113 is ingested and its match details carry the text `RAFAEL "CANARIO" GARCÍA`
- **THEN** it is stored as year 2026 with that dedication as its display name

### Requirement: Category, tournament and phase normalization
The system SHALL derive each match's category (rama) from the `categoria` field of the match details: MAYORES MASCULINO becomes Masculino and MAYORES FEMENINO becomes Femenino. The source tournament label (FUTBOL SALA, MAYORES, FUTSAL, Mayores Femenino) SHALL NOT be used as the category.

Each source series SHALL become a phase. Every phase SHALL be classified with one of these roles:
- league (round-robin, with standings);
- knockout round;
- final;
- third-place play-off.

Phases SHALL be grouped into tournaments by documented naming rules, and a curated override list SHALL take precedence over those rules. Each tournament SHALL have one of these kinds: Apertura, Clausura, Liga, Copa de Oro / Play-off, Copa de Plata, Final anual / Universitario, or Otro. Original source names SHALL always be preserved.

#### Scenario: Different labels, same category
- **WHEN** season 2012 lists phase "Copa 1" under the label MAYORES and phase "Copa 2" under the label FUTBOL SALA, and both have match details with categoria MAYORES MASCULINO
- **THEN** both phases belong to the Masculino category of season 2012

#### Scenario: Phases grouped into one tournament
- **WHEN** season 2025 lists the series "APERTURA", "APERTURA SERIE 1", "APERTURA - SERIE 2" and "FINAL DEL APERTURA"
- **THEN** all four phases belong to the tournament "Apertura" of season 2025 (Masculino)
- **AND** "FINAL DEL APERTURA" has the role final

#### Scenario: Third-place play-off is not the final
- **WHEN** season 2016 lists "COPA DE ORO", "FINAL ORO" and "3º Y 4º PUESTO" for Masculino
- **THEN** the three phases belong to one Copa de Oro tournament
- **AND** "FINAL ORO" has the role final and "3º Y 4º PUESTO" has the role third-place play-off

#### Scenario: Override assigns an ambiguous phase
- **WHEN** the override list assigns season 2023 phase "Futbol Sala Serie 1" to the Apertura tournament
- **THEN** that phase belongs to Apertura 2023, even though its name does not mention Apertura

#### Scenario: Unrecognized phase name
- **WHEN** a series name matches no grouping rule and no override
- **THEN** the phase becomes its own tournament named after the series
- **AND** the name is listed in the run report for curation

### Requirement: Match records
Each match SHALL be keyed by its source match ID and SHALL record:
- season, category, tournament, phase, round, leg (rueda) and match number;
- the scheduled date and time, interpreted as America/Montevideo local time;
- venue, home team and away team;
- goals for each side and points awarded to each side;
- the walk-over flag and observations text.

A match whose score is missing SHALL have the status "programado" and SHALL be excluded from all statistics.

#### Scenario: Re-ingestion updates in place
- **WHEN** a match that already exists is ingested again with a corrected score
- **THEN** the existing match record is updated and no duplicate match is created

#### Scenario: Unplayed match
- **WHEN** the source lists a match whose goal fields are empty or null
- **THEN** the match is stored with status "programado"
- **AND** it does not count towards any standings, totals, leaderboards or streaks

### Requirement: Chronological order and doubtful dates
A match's season SHALL always be the source season under which it is listed, never a season derived from its date. Matches SHALL be ordered chronologically by season year, then published kickoff, then match ID; this order drives streaks, form, milestones and match logs. A match whose published kickoff year differs from its season year SHALL be flagged as having a doubtful date.

When the listing and the match details publish different times for the same match, the listing time (`Fecha_Hora`) SHALL be the kickoff. The details times (`Fecha_Inicio`, `Fecha_fin`) SHALL be kept as secondary data.

#### Scenario: Match dated outside its season
- **WHEN** a match listed in season 2009 has the published kickoff 2021-10-21
- **THEN** it remains a 2009 match, is flagged as having a doubtful date, and is ordered after the other 2009 matches

#### Scenario: Listing and details disagree on time
- **WHEN** the listing gives match 92923 the time 2025-05-16 20:45 and its details give 2025-05-16 22:00
- **THEN** the match kickoff is 2025-05-16 20:45 Montevideo time

### Requirement: Player identity by membership card
Players SHALL be identified by the source membership card number (`carne`). Every distinct name published for the same card SHALL be retained as a known name variant, and the most recently published name SHALL be the display name. Two records with different card numbers SHALL never be merged automatically because their names match.

#### Scenario: Name variants for one card
- **WHEN** a (fictional) card 99001 is published as "JUAN PEREZ" in 2015 and as "JUAN PABLO PEREZ" in 2025
- **THEN** a single player exists whose display name is based on "JUAN PABLO PEREZ"
- **AND** both names are searchable

#### Scenario: Same name, different cards
- **WHEN** two different card numbers are both published with the name "JUAN PEREZ"
- **THEN** two distinct players exist

### Requirement: Team identity
Teams SHALL be identified by their normalized published name within a category. Normalization trims and collapses whitespace and ignores case and accents. A curated alias list SHALL be able to merge different published names into one team. A men's team and a women's team from the same institution SHALL be distinct teams.

#### Scenario: Normalized names match
- **WHEN** one match lists "NAUTICO CARRASCO Y PUNTA GORDA" and another lists "Nautico Carrasco y Punta  Gorda" in the same category
- **THEN** both refer to the same team

#### Scenario: Curated alias merges a renamed team
- **WHEN** the alias list maps the published name A to team T
- **THEN** every match published under name A is attributed to team T

#### Scenario: Men's and women's teams are separate
- **WHEN** an institution has matches in both the Masculino and Femenino categories
- **THEN** its men's and women's records are kept as two separate teams

### Requirement: Authoritative score and unattributed goals
The published final score SHALL be authoritative for match results, points, standings and team goal totals. For each side, when the published score exceeds the number of recorded goal events, the difference SHALL be stored as unattributed goals ("Gol sin autor registrado"). When recorded goal events exceed the score, the match SHALL be flagged as inconsistent: all events are kept, no negative or placeholder adjustment is made, and the score still governs results and totals. Player goal statistics SHALL count only goals attributed to that player.

#### Scenario: Missing scorers become unattributed goals
- **WHEN** a match ended 12–4 and the source lists 5 goal events for the home side and 4 for the away side
- **THEN** the match has 7 unattributed home goals and 0 unattributed away goals
- **AND** the home team's goals-for total for that match is 12

#### Scenario: More events than goals
- **WHEN** a match's published score gives the home side 4 goals but the source lists 5 home goal events
- **THEN** the match is flagged as inconsistent and all 5 events are kept
- **AND** the home team's goals-for total for that match is 4

### Requirement: Verbatim event minutes
Goal and substitution minutes SHALL be stored exactly as published, including the placeholder values 0 and 1. No minute SHALL be inferred, corrected or discarded.

#### Scenario: Placeholder minute is kept
- **WHEN** the source publishes a goal at minute "1"
- **THEN** the goal is stored with minute 1

### Requirement: Own goals
A recorded goal whose scorer appears in the lineup of the team opposite to the side the goal is credited to SHALL be treated as an own goal. An own goal counts for the credited side's score. It SHALL NOT count as a goal in the scorer's statistics, and it SHALL count in the scorer's own-goal tally. The source's `EnContra` field SHALL NOT be the sole basis of this decision.

#### Scenario: Home player scores for the visitors
- **WHEN** match 19906 lists player card 26947, who is in the home lineup, among the visitors' goals
- **THEN** that goal is an own goal by card 26947 credited to the visitors
- **AND** it is not counted among that player's goals

### Requirement: Card attribution by lineup name
The source publishes yellow and red cards with a name but no card number. A card SHALL be attributed to the player whose name in that match's lineup equals the published name, ignoring case, accents and repeated whitespace. The same side's lineup SHALL be checked first and the opposite side's lineup second. A card with no match SHALL be stored as unresolved, keeping its raw name and observations; it SHALL count in match and team totals but in no player's statistics.

#### Scenario: Red card attributed through the lineup
- **WHEN** match 24293 lists "ANDRES MAURICIO REPETTO" as expelled for the home side and that name appears in the home lineup
- **THEN** the red card is attributed to that lineup player's card number

#### Scenario: Unresolvable card
- **WHEN** a published card name does not appear in either lineup of the match
- **THEN** the card is stored as unresolved with its raw name
- **AND** it appears on the match page but in no player profile

### Requirement: Appearances and lineup details
A player SHALL be counted as appearing in a match when listed in either side's lineup for that match. The shirt number and captain marker SHALL be recorded for each appearance. The source does not distinguish starters from substitutes in futsal, so every listed player SHALL count as one appearance.

#### Scenario: Captain recorded
- **WHEN** a lineup entry carries the captain marker "(C)" and shirt number 12
- **THEN** the appearance is stored with captain = true and shirt number 12

### Requirement: Walk-overs, observations and placeholders
A match with the source walk-over flag set SHALL be marked as a walk-over (W.O.). Its result, points and goals as published SHALL count for team results, team goal totals and standings. It SHALL be excluded from player appearances, player win/draw/loss records and match-based records such as biggest win or highest-scoring match. Observations text SHALL be preserved verbatim. The venue placeholder "CANCHA A FIJAR" and the referee placeholder "A A ,FEDERACION" SHALL be stored as unknown values rather than as a real venue or referee.

#### Scenario: Walk-over match
- **WHEN** match 55623 has the walk-over flag, the score 0–3 and the observation "Equipo local (CUBA) no se presenta."
- **THEN** the away team is credited with a win and 3 points
- **AND** no player is credited with an appearance in that match
- **AND** the match does not appear in biggest-win records

#### Scenario: Placeholder referee
- **WHEN** the only referee listed for a match is "A A ,FEDERACION"
- **THEN** the match has no known referee

### Requirement: Official standings
For every phase where the standings endpoint returns rows, the system SHALL store the official table as published: team, PJ, PG, PE, PP, GF, GC and Puntos. Each row's position SHALL be its order in the published list.

#### Scenario: Standings stored in published order
- **WHEN** the standings endpoint returns six rows for "APERTURA" 2025 with "BOHEMIOS FS" first
- **THEN** "BOHEMIOS FS" is stored in position 1 of that phase's official standings

### Requirement: Ingest run report
Every ingest run SHALL produce a report containing:
- the number of requests made, responses changed and items failed;
- new or unrecognized phase names;
- unresolved card names;
- matches flagged as inconsistent;
- team names that are new, so they can be checked against aliases.

#### Scenario: Report lists curation work
- **WHEN** a run encounters an unrecognized phase name and two unresolved red-card names
- **THEN** the run report lists that phase name and both card names with their match IDs
