# Tasks

## 1. Monorepo foundation

- [x] 1.1 Initialize the pnpm workspace:
  - root `package.json` and `pnpm-workspace.yaml`;
  - strict `tsconfig.base.json`;
  - `.nvmrc` (Node 24 LTS), `.gitignore`, `.editorconfig`;
  - ESLint, Prettier and the Vitest workspace;
  - a `pnpm verify` script that runs lint, typecheck and tests.

  Verify: `pnpm install && pnpm verify` succeeds.
- [x] 1.2 Scaffold `packages/domain`, `packages/db`, `packages/contracts`, `apps/api`, `apps/ingest` and `apps/web`, each with build and test scripts (design D1). Verify: `pnpm -r build` succeeds and each package exports a placeholder.
- [x] 1.3 Add a local development `docker-compose.dev.yml` with postgres:18 and `.env.example` defining:
  - `DATABASE_URL_INGEST` and `DATABASE_URL_API`;
  - `LIGAPEDIA_CONTACT`, `LIGAPEDIA_DOMAIN`, `INGEST_CONCURRENCY`.

  Verify: `docker compose -f docker-compose.dev.yml up -d db` starts and `psql -c "select 1"` works.

## 2. Database schema (packages/db)

- [x] 2.1 Create a Drizzle migration for the persistent schemas `raw`, `registry`, `ops` and `meta`. Include the `pg_trgm` and `unaccent` extensions and an `IMMUTABLE` unaccent wrapper function (design D3, D11). Verify: migrations apply on a fresh database and re-running them is a no-op (integration test).
- [x] 2.2 Implement a schema-parameterized DDL builder for the `core` tables:
  - seasons, tournaments (with `sport` and `kind`), phases (with `role`), rounds;
  - teams and team names, venues, players and player names;
  - matches, with flags `walk_over`, `inconsistent` and `doubtful_date`, plus per-side unattributed goal counts;
  - appearances, goals (with `own_goal`), cards (resolved or unresolved), substitutions, officials;
  - official standings.

  Verify: an integration test creates `core_next` and introspects every expected table and index.
- [x] 2.3 Implement the DDL builder for the `stats` read models (design D5):
  - `player_match`, `team_match`;
  - `player_agg`, `team_agg`, `team_opponent_agg`, `player_opponent_agg`;
  - `streaks`, `milestones`, `champions`, `standings_by_round`, `coverage`;
  - `records_*`, `search_index`;
  - the composite and trigram indexes.

  Verify: an integration test creates `stats_next` and asserts that the indexes exist.
- [x] 2.4 Create the database roles `ligapedia_ingest` (owner) and `ligapedia_api` (SELECT only on `core`, `stats` and `meta`), plus a helper that grants the API role on newly built schemas. Verify: a test shows the API role can SELECT but not INSERT, before and after a simulated schema swap.

## 3. Domain rules (packages/domain)

- [x] 3.1 Write a one-off fixture recorder script and commit the real source responses it captures under `packages/domain/test/fixtures`:
  - the season list;
  - the FUTSAL tournament and series lists of every season 2006–2026 (about 55 cheap calls; this is the input for the golden phase fixture in 3.5);
  - the rounds of 2025;
  - all 12 detail actions for matches 92923, 19906, 24293 and 55623;
  - the standings for 2025 "APERTURA" and "APERTURA SERIE 1".

  Verify: the fixture files exist and parse as JSON.
- [x] 3.2 Implement TypeBox schemas for every source endpoint response. Error bodies (`{"error": …}`) and empty bodies must map to empty lists. Verify: unit tests pass on every captured fixture and on synthetic error and empty bodies (spec data-ingestion "Polite and resilient fetching").
- [x] 3.3 Implement name normalization (NFD, strip accents, uppercase, collapse whitespace, trim) and display-name casing:
  - Spanish particles lowercased for players;
  - an acronym list and dotted acronyms preserved for teams;
  - a `data/overrides/display-names.yaml` loader.

  Verify: unit tests cover "ARGOS ", "SAN JOSE DE LA PROVIDENCIA uni", "C.U.B.A." and "UNIVERSIDAD ORT".
- [x] 3.4 Implement season parsing: the year from "Año YYYY", with code + 1913 as fallback, and the dedication text. Verify: unit tests for `Año 2006`, `AÑO 2019`, `Temporada 110 "Año 2023"` and `RAFAEL "CANARIO" GARCÍA` (code 113 → 2026).
- [x] 3.5 Implement the phase classifier (role and tournament kind, with the precedence rules in design D6) and the `data/overrides/phases.yaml` loader. Commit a golden fixture listing all 186 observed series names (2006–2026) with their expected kind and role. Verify:
  - the golden test passes;
  - an unknown name falls back to its own tournament and is reported;
  - the 2016 "3º Y 4º PUESTO" and 2023 "Futbol Sala Serie 1" scenarios pass.
- [x] 3.6 Implement tournament grouping (season × category × kind → tournament key) and team identity: normalized key per category, `data/overrides/team-aliases.yaml`, and men's and women's teams kept distinct. Verify: unit tests for the spec scenarios "Phases grouped into one tournament", "Curated alias merges a renamed team" and "Men's and women's teams are separate".
- [x] 3.7 Implement the match event rules:
  - the listing score is authoritative, with unattributed and inconsistent goal counts;
  - own goals are detected by lineup membership;
  - cards are attributed by normalized name within the lineups, and ambiguous names stay unresolved;
  - walk-over, venue and referee placeholders, doubtful dates, and the listing-time kickoff.

  Verify: unit tests on fixtures 19906 (own goal), 24293 (red cards), 55623 (W.O.) and 92923 (time mismatch), plus synthetic 12–4 and "more events than goals" cases.
- [x] 3.8 Implement the champion rule: the final phase is won on wins, then aggregate goal difference; otherwise the league-table leader; third-place phases are excluded; `data/overrides/champions.yaml` applies. Verify: unit tests for single-match, two-legged, undetermined and league-only tournaments (spec competitions "Champions").

## 4. Fetcher and raw archive (apps/ingest)

- [x] 4.1 Implement the HTTP client:
  - concurrency limiter (default 4) and 30 s timeout;
  - 4 attempts with exponential backoff and jitter;
  - circuit breaker after 20 consecutive failures;
  - User-Agent with `LIGAPEDIA_CONTACT`.

  Verify: tests against a local mock server show a 503 retried and then succeeding, never more than 4 requests in flight, and an error body counted as success.
- [x] 4.2 Implement the raw archive repository: request key (endpoint plus sorted params), SHA-256 content hash, and an upsert that moves `changed_at` only when the hash changes. Verify: an integration test shows that an identical re-fetch leaves `changed_at` untouched and a changed body updates it.
- [x] 4.3 Implement the full-tree crawl for a sport label: seasons → tournaments → series → rounds → matches, the 12 detail actions per match, and standings per series. A backfill start marker lets it resume. Verify: an integration test against a mock source serving the fixture season archives every expected key; after an interruption, a rerun skips already archived keys (spec scenario "Interrupted backfill resumes").

## 5. Normalization, statistics and publishing

- [x] 5.1 Implement the normalizer: build `core_next` from the raw archive, the overrides and the registry, assigning stable registry IDs and slugs to unseen players, teams, tournaments and phases. Verify: an integration test on the fixture archive checks:
  - row counts and the score of match 92923;
  - captains and shirt numbers;
  - the own goal in 19906 and the W.O. in 55623;
  - that registry IDs stay stable across two rebuilds.
- [x] 5.2 Implement the statistics SQL (`packages/db/stats/*.sql`, run in order) that fills `stats_next`:
  - match facts, aggregates and opponent aggregates;
  - streaks (gaps and islands) and milestones;
  - computed and after-round standings, champions, coverage;
  - record lists and the search index.

  Verify: integration tests on a seeded dataset assert:
  - player and team totals;
  - head-to-head sums equal to the totals;
  - streak boundaries, the 50th-appearance milestone and standings after round 2;
  - the two-legged champion and goal coverage percentages.
- [x] 5.3 Implement the sanity gates (abort if matches drop more than 1%, a season disappears, a season has no phases, or a phase has rounds but no matches). Verify: tests that trigger each gate and assert that nothing is published.
- [x] 5.4 Implement the atomic publish in one transaction: grants, the `core`/`stats` ↔ `_next` schema swap, keeping `*_prev`, bumping `meta.dataset`, and `NOTIFY dataset_published`. Add the `rollback` operation. Verify: an integration test where a pooled connection that read the old version reads the new version after the swap, and the old one again after rollback.
- [x] 5.5 Implement run reporting: the `ops.ingest_runs` row and a report JSON containing:
  - requests made, responses changed, items failed;
  - unknown phases and new team names;
  - unresolved cards and inconsistent matches.

  Print a stdout summary and set the exit code. Verify: a test asserts the report contents for a fixture run with an unknown phase and two unresolved cards.

## 6. Ingest commands and daily refresh

- [x] 6.1 Implement the CLI commands `migrate`, `backfill [--from --to]`, `season <year>`, `daily [--force]`, `rebuild` and `rollback`, all sharing `pg_try_advisory_lock`. Verify: a test runs two concurrent commands and the second exits with "skipped: running" and no data change.
- [x] 6.2 Implement the once-per-day guard on the America/Montevideo calendar date, with `--force` and failed runs not counted. Verify:
  - tests at Montevideo-time boundaries: 02:59, 03:05 and 23:59, i.e. 05:59, 06:05 and 02:59 UTC the next day;
  - the spec scenarios "Second trigger on the same day" and "Operator forces a refresh".
- [x] 6.3 Implement the daily planner:
  - active seasons: the newest season plus seasons with matches in the last 60 days or in the future;
  - details for listing rows whose hash changed and for matches in the 14-day recency window;
  - rotation through the least recently verified historical season;
  - detection of new season codes.

  Verify: mock-source tests for "New result published", "Late-loaded scorers", "Correction to an old season" and "New season appears" (code 114 → 2027).
- [x] 6.4 Implement the failure threshold: if more than 20% of requests fail after retries, abort without publishing and exit non-zero. Verify: a test with a mock source failing 30% of requests asserts the dataset version is unchanged, the run status is failed, and the exit code is non-zero.
- [x] 6.5 Run the full backfill against the live source (concurrency 4, overnight) into the local database. Review the run report and commit the initial curation in `team-aliases.yaml`, `phases.yaml`, `champions.yaml` and `display-names.yaml`. Verify:
  - 21 seasons and at least 1,844 matches are published;
  - a `rebuild` after curation reports zero unknown phase names;
  - a champions spot-check of five seasons against the official site.

## 7. API (apps/api)

- [x] 7.1 Set up the Fastify app with:
  - the TypeBox provider using `packages/contracts`;
  - pino logs, a `Server-Timing` header and `@fastify/rate-limit`;
  - `GET /api/health` (DB status, dataset version, refresh age);
  - `GET /api/v1/meta` (version, last successful refresh, coverage summary).

  Verify: `inject` tests for both endpoints.
- [x] 7.2 Implement the response cache: an LRU keyed by dataset version, route and canonical query; a strong ETag; `304` handling; `Cache-Control: no-cache`; and invalidation via `LISTEN dataset_published` with a 30 s poll fallback. Verify: tests show the same version returns 304 and that a version bump returns new content (spec "HTTP caching tied to dataset version").
- [x] 7.3 Implement shared, forgiving filter parsing for `temporada`, `desde`, `hasta`, `rama`, `torneo`, `tipo`, `equipo`, `rival`, `jugador`, `top`, `min` and `orden`. Invalid values go into `meta.ignoredFilters`. Verify: unit tests including the spec scenario "Invalid season in URL" (season 1990).
- [x] 7.4 Implement the competition endpoints:
  - seasons index and season detail;
  - tournaments by season, category and kind, and tournament detail;
  - phase detail with rounds, matches, official or computed standings, and after-round standings;
  - champions with a kind filter.

  Verify: contract tests on the fixture database covering the spec scenarios in competitions.
- [x] 7.5 Implement the match endpoint:
  - header data;
  - lineups with captain and shirt number;
  - goals with own-goal flags and unattributed expansion;
  - resolved and unresolved cards, substitutions, referees with placeholders suppressed;
  - W.O. and observations;
  - head-to-head record with the last 5 meetings, and the official source URL.

  Verify: tests for the synthetic 12–4 match (7 "Gol sin autor registrado"), match 55623 (W.O.) and the placeholder referees.
- [x] 7.6 Implement the player endpoints:
  - list with filters, sorting and pagination;
  - profile summary with titles;
  - season × team breakdown and the filterable match log;
  - milestones, the versus-teams table and coverage.

  Verify: contract tests, plus a test that serializes every player payload and asserts no membership card number appears.
- [x] 7.7 Implement the team endpoints:
  - list and profile summary, including points percentage and walk-over counts;
  - form and streaks;
  - per-season history with positions and top scorer;
  - squad by season and club leaders;
  - the versus-all-teams table.

  Verify: tests show the opponents-table match count equals the team total under the same filters, and the spec's win/points-percentage example gives 50% and 56.7%.
- [x] 7.8 Implement the comparison endpoints:
  - team versus team, with season-range and tournament filters;
  - player versus player: as opponents, as teammates, and both careers.

  Verify: tests for "Head-to-head summary", "Filtered head-to-head", "Players who faced each other" and "Players who never met"; p95 server time under 150 ms on the full dataset is checked in 10.1.
- [x] 7.9 Implement the player leaderboard endpoints for all metrics in spec records, with filters, top N, tie ranking (fewer appearances, then name, shared rank numbers), minimum sample (default 10) and coverage notices. Verify: tests for "Tied scorers", "Default minimum applied", "Visitor lowers the minimum" and "Goal coverage notice".
- [x] 7.10 Implement the team leaderboards (including titles by kind and streaks over year ranges), match records (W.O. excluded), single-match and season records, and season top scorers. Verify: tests for "Most titles", "Walk-overs excluded" and "Top scorer per season".
- [x] 7.11 Implement the search endpoint: token AND-matching over unaccented normalized text, with a trigram similarity fallback, grouped into Jugadores, Equipos and Torneos with at most 10 results each. Verify: tests for "nautico", "perez juan", "hebraika" and an old name variant, plus p95 under 100 ms in 10.1.

## 8. Web foundation (apps/web)

- [x] 8.1 Scaffold the web app:
  - Vite + React 19 + TypeScript;
  - Tailwind CSS v4 via `@tailwindcss/vite`;
  - `npx shadcn@latest init -t vite` and the `@` alias;
  - shadcn components: button, card, table, tabs, badge, tooltip, command, select, dialog, sheet, skeleton, chart.

  Verify: `pnpm --filter web build` succeeds and a sample page renders the components.
- [x] 8.2 Implement the theme: light and dark tokens following the system preference, a persistent toggle, and a self-hosted, preloaded variable font. Verify: a Playwright test shows the toggle persists across reloads, and axe reports no color-contrast violations on a sample page.
- [x] 8.3 Set up TanStack Router with file-based Spanish routes (design D10) and TanStack Query:
  - loaders using `ensureQueryData`;
  - `defaultPreload: 'intent'` and `staleTime` 5 min;
  - typed, forgiving search-param validation;
  - Spanish 404 and error boundaries.

  Verify: route tests for an unknown match ("Partido no encontrado"), and a slug mismatch redirecting to the canonical player URL.
- [x] 8.4 Build the shared UI:
  - app shell: Spanish navigation, search trigger, and a footer with "Datos actualizados", attribution and "Sitio no oficial";
  - `FilterBar` and `DataTable`, with sorting, a sticky first column and contained horizontal scroll;
  - `StatCard`, `ResultBadge` (G/E/P), `CoverageNotice` and empty and error states;
  - formatters using `es-UY` numbers and Montevideo dates, and the `es.ts` strings dictionary.

  Verify: component tests for decimal comma "0,71", Montevideo time for a Europe/Madrid browser, and the freshness text format.
- [x] 8.5 Generate a typed API client from `packages/contracts`. Verify: `pnpm typecheck` fails when a contract field the UI uses is removed.

## 9. Web pages

- [x] 9.1 Build the home page: recent results, scheduled matches, current standings, current top scorers, highlighted records and search. Verify: a Playwright smoke test against a seeded API shows the 2026 sections.
- [x] 9.2 Build the seasons index and season page, with categories grouped Masculino/Femenino, champions, top scorers and summary figures. Verify: Playwright checks for the order 2026 → 2006 and the 2019 two-category grouping.
- [x] 9.3 Build the tournament and phase pages: round selector, official, computed and after-round standings, knockout match lists, champion or "Campeón no determinado", and the W.O. badge. Verify: Playwright scenarios from spec competitions.
- [x] 9.4 Build the match page with all sections from spec match-details. Verify: Playwright shows the "Gol sin autor registrado" entries, "(e.c.)", the W.O. notice, "Sin datos de árbitros", and the head-to-head link.
- [x] 9.5 Build the team directory and the team profile tabs: resumen (with lazily loaded charts and table alternatives), temporadas, plantel, partidos, rivales and líderes. Verify: Playwright navigation through all tabs, with filters reflected in the URL.
- [x] 9.6 Build the player directory and the player profile tabs: resumen, temporadas, partidos, rivales and hitos, with coverage notices. Verify: Playwright checks the tabs and that the URL and page never contain a membership card number.
- [x] 9.7 Build the comparison pages `/comparar/equipos` and `/comparar/jugadores`, with search-based pickers. Verify: a Playwright test compares two teams and two players, including the never-met message.
- [x] 9.8 Build the records hub, player, team and match leaderboards, "Goleadores por temporada" and the champions page with the kind filter. Include the min-sample control and coverage notices. Verify: a Playwright test opens a shared leaderboard URL in a new context and reproduces the view, and back/forward restores the filters.
- [x] 9.9 Build the global search palette (`/` and Ctrl/Cmd+K) and the `/buscar` page. Verify: a keyboard-only Playwright flow opens the palette, searches "nautico" and reaches a team page.
- [x] 9.10 Write the "Sobre los datos" page: source attribution and links, missing scorers, verbatim minutes, sparse yellow cards, walk-overs, doubtful dates, the champion rules, and a corrections contact. Verify: the page renders and is linked from the footer.

## 10. Performance, accessibility and responsiveness verification

- [x] 10.1 Add a load-test script (autocannon) over representative endpoints with varied filters on the full dataset. Verify that `Server-Timing` p95 is at most:
  - 50 ms for entities, lists, standings and leaderboards;
  - 150 ms for head-to-head and year-range aggregates;
  - 100 ms for search.

  Add or adjust indexes until the budgets pass.
- [x] 10.2 Add a `size-limit` check of at most 200 KB gzip for the first-route JavaScript to `pnpm verify`. Verify: the check passes, and it fails if Recharts is imported eagerly.
- [x] 10.3 Run Lighthouse CI (mobile) on the home, player and team pages against the production build served by local compose. Verify: performance is at least 90 and LCP at most 2.5 s on all three.
- [x] 10.4 Add axe audits for every main page and the keyboard e2e test for a leaderboard. Verify: no serious or critical violations, and every control is reachable with a visible focus indicator.
- [x] 10.5 Add a responsive e2e test at a 360 px viewport across the main pages. Verify: there is no page-level horizontal scroll, and table first columns stay visible while scrolling.

## 11. Deployment on the VPS (Docker Compose)

- [x] 11.1 Write multi-stage Dockerfiles:
  - an api/ingest image on Node 24 with separate entrypoints;
  - a web image that builds the SPA and runs Caddy 2 with the static files.

  Verify: both images build, and the containers start locally.
- [x] 11.2 Write the production `deploy/docker-compose.yml`:
  - `db` with a volume and not exposed; `api`; `web`; `ingest` in the `jobs` profile;
  - env files, healthchecks and restart policies.

  Write the `deploy/Caddyfile`: HTTPS, `/api` proxy, SPA fallback, immutable `/assets`, `no-cache` index, zstd/gzip, and CSP/HSTS headers. Verify: with `LIGAPEDIA_DOMAIN=localhost`, curl shows the expected cache and security headers, and the API returns 304 on revalidation.
- [ ] 11.3 Write `deploy/install-cron.sh` (detects the host timezone: Montevideo → `0 3 * * *`, UTC → `0 6 * * *`, otherwise refuse), the `/etc/cron.d/ligapedia` template running `docker compose --profile jobs run --rm ingest daily` with logging to `/var/log/ligapedia/ingest.log`, and a logrotate stanza. Verify: script tests for each timezone branch, and a manual `ingest daily` on the VPS writes a log entry.
- [x] 11.4 Add the post-publish backup step: `pg_dump` of `registry`, `raw` and `ops` to `/var/backups/ligapedia`, keeping 7 copies. Verify: a restore into a scratch database followed by `ingest rebuild` reproduces identical player and team URLs.
- [ ] 11.5 Write `deploy/deploy.sh` (pull, build, migrate, `up -d`) and a README runbook covering:
  - first deploy and backfill;
  - forced refresh, `season <year>` and `rollback`;
  - the curation workflow driven by run reports;
  - log locations.

  Verify: a dry run of the runbook on a fresh VM or VPS.
- [ ] 11.6 Roll out to production following the design's Migration Plan (provision, migrate, backfill, start, verify health and budgets, install cron). Verify the next morning:
  - `ops.ingest_runs` shows a successful scheduled run that started at 03:00 America/Montevideo;
  - the site footer shows the new "Datos actualizados" time;
  - a second manual `ingest daily` the same day reports "skipped: already refreshed today".
