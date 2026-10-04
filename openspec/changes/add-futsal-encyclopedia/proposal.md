# Proposal

## Why

Twenty years of Liga Universitaria de Deportes (LUD) futsal history (2006–2026: every match, lineup, goal, card and standings table) is only reachable through two cascading-dropdown widgets on ligauniversitaria.org.uy. Those widgets show one round or one table at a time and cannot answer questions across seasons, players or teams. Ligapedia will turn that data into a fast, Spanish-language encyclopedia, comparable in coverage to what [LUD Stats](https://lud-stats.vercel.app/) offers for football, where anyone can browse and query futsal history by year, tournament, team or player and see records and head-to-head histories.

## What Changes

- **New data pipeline** that crawls the league's public JSON endpoints behind the "Detalle histórico de las fechas" and "Tablas de posiciones" pages (`/detallefechas/api.php`, `/posiciones_historicas/api.php`). It covers every FUTSAL season (source codes 93–113 = 2006–2026), both men's and women's competitions, and every phase, round, match, lineup, goal, substitution, card, referee and official standings table. Raw responses are archived and normalized into a relational model keyed on the league's own identifiers (match ID, player membership card `carne`).
- **Explicit data-quality rules** for the incomplete source:
  - The published final score is authoritative.
  - Goals without a recorded scorer appear as "Gol sin autor registrado".
  - Goal minutes are kept exactly as published, even the placeholder `1'`/`0'` values.
  - Walk-overs, suspended matches and placeholder venues and referees are flagged rather than silently mixed into statistics.
- **Daily refresh** at 03:00 America/Montevideo, at most once per day. It updates the current season, re-verifies one historical season per night, rebuilds precomputed statistics and invalidates caches. If a run fails, the site keeps serving the previous dataset.
- **Public read-only website, entirely in Spanish** (React + shadcn/ui + Tailwind CSS), backed by a Fastify JSON API and PostgreSQL:
  - Seasons, tournaments and phases, with fixtures, results and standings
  - Champions
  - Match pages
  - Player profiles and careers
  - Team profiles
  - Head-to-head (team vs team, team vs all opponents, player vs player, player vs team)
  - Records and top-X leaderboards (goals, appearances, yellow/red cards, cards per match, streaks, biggest wins, and more)
  - Global accent-insensitive search
- **Performance as a requirement**: aggregates are precomputed after each refresh, every query path is indexed, responses are cached and versioned by dataset, and the frontend is code-split, with explicit latency and page-weight budgets.
- **Deployment on the owner's own VPS with Docker Compose** (PostgreSQL, API, Caddy serving the SPA, one-shot ingest container), with the daily run triggered by a host cron entry.
- **Futsal only**: the data model carries a `sport` dimension so other LUD sports can be added later, but only FUTSAL is ingested or shown.

## Capabilities

### New Capabilities
- `data-ingestion`: Crawling the LUD futsal source endpoints, archiving raw responses, normalizing seasons, categories, tournaments, phases, rounds, matches, lineups and events, resolving player and team identity, and applying data-quality rules (authoritative score, unattributed goals, verbatim minutes, own goals, walk-overs, placeholders). Includes a resumable full historical backfill.
- `daily-refresh`: Scheduled incremental refresh at 03:00 America/Montevideo, at most once per day. Covers rolling re-verification of historical seasons, statistics rebuild, dataset versioning and cache invalidation, run history, and failure isolation.
- `competitions`: Browsing seasons, categories (masculino/femenino), tournaments and phases, with fixtures and results by round, official and computed standings, and champions.
- `match-details`: A match page with score, date, venue, phase and round, lineups with captains and shirt numbers, goals (including unattributed ones), cards, substitutions, referees, walk-over and observation notes.
- `player-stats`: Player profiles and careers: appearances, goals, cards, W/D/L and win rate, per-season and per-team breakdowns, match log, milestones, and head-to-head against another player, against a team, and against every opponent team.
- `team-stats`: Team profiles: W/D/L and points rate, goals, clean sheets, form and streaks, per-season history, titles, club all-time leaders, squads per season, and head-to-head against one team and against all teams.
- `records`: Filterable top-X leaderboards and record lists for players, teams and matches, with minimum-sample rules for ratio rankings and data-coverage notices.
- `search`: Global accent-insensitive search across players, teams and tournaments, plus consistent, shareable URL filters (season/year, category, tournament, team, player) across all list pages.
- `web-experience`: The Spanish-language UI built with shadcn/ui and Tailwind CSS: responsive layout, light/dark themes, Montevideo-time date formatting, data-freshness and coverage indicators, and the performance and caching budgets the site must meet.

### Modified Capabilities

None. This is a greenfield project with no existing specs.

## Impact

- **Code**: new pnpm/TypeScript monorepo:
  - `apps/web`: Vite + React + TanStack Router/Query + shadcn/ui + Tailwind CSS
  - `apps/api`: Fastify
  - `apps/ingest`: crawler and refresh CLI
  - `packages/db`: Drizzle schema, migrations and statistics SQL
  - `packages/contracts`: shared API types and schemas
- **Infrastructure**: PostgreSQL (with `pg_trgm` and `unaccent`), Docker Compose stack, Caddy reverse proxy with automatic HTTPS, and a host cron entry for the 03:00 Montevideo run.
- **External systems**: read-only HTTP load on ligauniversitaria.org.uy, with requests taking about 1.3 s each:
  - **Backfill**: a one-time run of several hours at bounded concurrency.
  - **Daily refresh**: a few hundred requests per day.
  - **Etiquette**: requests carry a descriptive User-Agent and use retries with backoff.
- **Non-goals for this change**:
  - Other sports, user accounts, follows or notifications.
  - Delegate or referee portals, and referee-centric statistics (the source's referee data is mostly placeholders).
  - Editing data in the UI, server-side rendering/SEO, and multi-language UI.
