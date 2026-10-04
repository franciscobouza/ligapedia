# Spec Delta

## Purpose

Define the overall experience of the public Ligapedia website:
- a Spanish-language, polished and accessible interface;
- consistent navigation;
- honest data-freshness and attribution indicators;
- measurable speed budgets that keep every page fast.

## ADDED Requirements

### Requirement: Spanish-language site
All user-facing text SHALL be in Spanish (Uruguay), including navigation, labels, statistics abbreviations (PJ, PG, PE, PP, GF, GC, DG, Pts), empty states, errors, notices and page titles. Page paths SHALL use Spanish words (for example `/jugadores`, `/equipos`, `/temporadas`, `/torneos`, `/partidos`, `/records`, `/comparar`). Numbers SHALL use Spanish formatting, with a comma as the decimal separator.

#### Scenario: Decimal formatting
- **WHEN** a statistic of 0.71 goals per match is displayed
- **THEN** it reads "0,71"

#### Scenario: Spanish paths
- **WHEN** a visitor navigates to a player profile
- **THEN** the URL path starts with `/jugadores/`

### Requirement: Montevideo time display
All dates and times SHALL be shown in America/Montevideo time, whatever the visitor's own time zone, using Spanish day and month names.

#### Scenario: Visitor in another time zone
- **WHEN** a visitor whose device is set to Europe/Madrid views a match scheduled at 21:45 Montevideo time
- **THEN** the match time is shown as 21:45

### Requirement: Consistent visual system and accessibility
The site SHALL use one consistent component and styling system across all pages:
- shared table, card, tab, badge, chart and filter components;
- a light and a dark theme that follow the visitor's system preference, with a manual toggle that persists.

The site SHALL meet WCAG 2.1 AA color contrast. Every interactive element SHALL be operable by keyboard with a visible focus indicator. Charts SHALL have an accessible text or table equivalent.

#### Scenario: Theme preference persists
- **WHEN** a visitor switches to the dark theme and later returns to the site
- **THEN** the site opens in the dark theme

#### Scenario: Keyboard navigation
- **WHEN** a visitor navigates a leaderboard using only the keyboard
- **THEN** every filter, sort control and row link can be reached and activated, with a visible focus indicator

### Requirement: Responsive layout
Every page SHALL be fully usable at viewport widths from 360 px upward, without page-level horizontal scrolling. Wide tables SHALL scroll horizontally inside their own container, with the first column (player or team) kept visible.

#### Scenario: Standings on a phone
- **WHEN** a visitor views a standings table on a 360 px wide screen
- **THEN** the page body does not scroll horizontally
- **AND** the table scrolls within its container while the team column stays visible

### Requirement: Navigation and stable links
The site SHALL provide primary navigation to:
- Inicio
- Temporadas
- Torneos
- Equipos
- Jugadores
- Records
- Comparar
- Campeones

Every season, tournament, phase, match, team and player SHALL have a stable URL that does not change across daily refreshes. Player URLs SHALL use an internal identifier and a name slug, never the membership card number. Unknown identifiers SHALL show a Spanish "no encontrado" page with an HTTP 404 status from the API.

#### Scenario: Stable player URL
- **WHEN** a visitor bookmarks a player profile and opens it after several daily refreshes
- **THEN** the same player's profile opens

#### Scenario: Unknown match
- **WHEN** a visitor opens a match URL whose identifier does not exist
- **THEN** a Spanish "Partido no encontrado" page is shown

### Requirement: Home page
The home page SHALL show:
- the current or latest season's recent results and upcoming scheduled matches;
- current standings;
- top scorers of the current season;
- a selection of all-time records;
- entry points to search and navigation.

#### Scenario: Home during an active season
- **WHEN** a visitor opens the home page while the 2026 season is in progress
- **THEN** it shows the most recent 2026 results, any scheduled matches, current standings and the 2026 top scorers

### Requirement: Freshness, attribution and disclaimers
Every page SHALL show:
- when the data was last updated ("Datos actualizados: <fecha y hora>");
- an attribution to the Liga Universitaria de Deportes as the data source, with a link to its site;
- a statement that Ligapedia is an unofficial site.

A permanent "Sobre los datos" page SHALL explain the known source gaps: missing scorers, placeholder minutes, sparse yellow cards, walk-overs, and how champions are determined.

#### Scenario: Freshness indicator
- **WHEN** the last successful refresh finished at 03:12 on 2 October 2026
- **THEN** every page shows "Datos actualizados: 2 oct 2026, 03:12"

### Requirement: Loading, empty and error states
The site SHALL show skeleton placeholders while data loads and descriptive Spanish empty states when a filter yields no data. On a failed request it SHALL show an error message with a retry action, and SHALL never show a blank page.

#### Scenario: Empty filter result
- **WHEN** a visitor filters a team's matches to a season in which the team did not play
- **THEN** the page states that the team has no matches for that filter

### Requirement: Server speed budgets
With the full historical dataset loaded on the production server, API responses SHALL meet these 95th-percentile server processing times:
- 50 ms for entity pages, lists, standings and leaderboards;
- 150 ms for head-to-head comparisons and filtered aggregates over year ranges.

#### Scenario: Leaderboard latency
- **WHEN** the goals leaderboard is requested 1,000 times with varied filters on the production server
- **THEN** at least 95% of the requests complete server processing within 50 ms

#### Scenario: Head-to-head latency
- **WHEN** player-versus-player comparisons are requested for 1,000 random player pairs
- **THEN** at least 95% complete server processing within 150 ms

### Requirement: Client speed budgets
The JavaScript needed to render the first page SHALL NOT exceed 200 KB gzip-compressed. The home, player profile and team profile pages SHALL score at least 90 in Lighthouse's mobile performance audit, and SHALL reach Largest Contentful Paint within 2.5 seconds under its default mobile throttling. Navigating back to a page whose data was already loaded SHALL render from cache without waiting for the network.

#### Scenario: Lighthouse audit
- **WHEN** Lighthouse's mobile performance audit runs against a production player profile
- **THEN** the performance score is at least 90 and Largest Contentful Paint is at most 2.5 s

#### Scenario: Cached back navigation
- **WHEN** a visitor goes from a team page to a player page and presses back
- **THEN** the team page renders immediately from cached data

### Requirement: HTTP caching tied to dataset version
API responses SHALL carry validators derived from the dataset version. Repeated requests for unchanged data SHALL be answered as not modified. Static assets SHALL use content-hashed file names and SHALL be cacheable for one year. After a successful refresh, clients SHALL receive the new data on their next request.

#### Scenario: Conditional request
- **WHEN** a browser re-requests an API resource with the validator of the current dataset version
- **THEN** the server responds "304 Not Modified" without a body

#### Scenario: Static asset caching
- **WHEN** a browser requests a hashed JavaScript bundle
- **THEN** the response allows caching for one year and marks the asset as immutable
