# Design

## Context

The repository is empty apart from OpenSpec scaffolding. See `proposal.md` for the motivation. This design is shaped by the following facts about the source, all measured on 2026-10-02 against the live site, and by the owner's constraints listed after them.

**Source endpoints.** The two official pages embed small apps whose data comes from `GET https://ligauniversitaria.org.uy/detallefechas/api.php?action=…` and `…/posiciones_historicas/api.php?action=…`.

- The listing actions form a cascade: `cargarTemporadas` → `cargarDeportes` → `cargarTorneos` → `cargarSeries` → `cargarFechas` → `cargarPartidos`.
- Each match needs 12 detail actions: `cargarDetallesPartido`, `jueces`, and the following for each side: `Titulares …`, `Cambios…`, `Goles…`, `Amonestados …` and `Expulsados …`.
- Standings come from `cargarPosiciones`.
- Empty sets come back as HTTP 200 with `{"error": "No se encontraron…"}`; `jueces` sometimes returns an empty body.

**Source performance.** Every request takes about 1.35 s server-side (Apache/WordPress). There are no rate-limit headers and no effective caching.

**Volume.** FUTSAL exists in season codes 93–113, i.e. 2006–2026; the year is the code + 1913. That history amounts to:
- 1,844 matches, 637 rounds and 186 series (phases), all with scores;
- 59 distinct team names.

A full crawl is about 1,844 × 12 + ~1,300 listing and standings calls ≈ 23,500 requests, or about 2.2 h at concurrency 4. The whole normalized dataset is roughly 35k appearances and 20k goals, which fits in memory many times over.

**Identifiers.**
- Matches have a stable global `ID`.
- Players have a stable membership card number (`carne`) in lineups and goals.
- Cards (`Amonestados`/`Expulsados`) carry only a name. In samples, those names match lineup names exactly.
- Teams are only names. Some names have stray whitespace and casing (`ARGOS `, `SAN JOSE DE LA PROVIDENCIA uni`).

**Quality, sampled on 57 matches from 2009, 2017 and 2025.**
- About 33% of goals have no recorded scorer (≈45% in 2009 and 2017, 0% in 2025), and 1 match has more goal events than its score.
- Yellow cards are almost absent: 2, both in 2025. Red cards are common (28). Substitutions are never recorded.
- Minutes are mostly placeholders (`1`, `0`).
- `EnContra` effectively means "the scorer is a visiting-side player". Own goals are therefore visible as scorers from the opposite lineup, which was confirmed on match 19906.
- Walk-overs carry `walk_over=1`, a 3–0 score, the present team's lineup and an explanatory note.
- The listing and the details disagree on kickoff times (match 92923: 20:45 vs 22:00).
- Some dates are wrong: a 2009 match is dated 2021, and a 2007 match is dated 2008.
- Standings are empty for the oldest seasons, e.g. 2006.

**Phase names.** The 186 phase names are highly irregular: "Futsal Cla. Gru1 Rueda 2", "SEMIFINALES TITÚLO", "SEMI Y FINAL CP", "Clausura-Playoff-Cuartos". Finals can be single matches, two-legged ties or series.

**Owner constraints.**
- Node/TypeScript, React, and PostgreSQL or similar ("choose what's fastest").
- shadcn/ui + Tailwind CSS.
- A Spanish UI.
- A refresh daily at 03:00 Montevideo, only once a day. The owner's machine is on America/Montevideo, which is UTC−03:00 with no DST since 2015.
- Hosting on the owner's VPS with Docker Compose and a host cron entry.
- Futsal only, but leave room for other sports.

## Goals / Non-Goals

**Goals:**
- Serve every page from precomputed, indexed read models so that the API answers in single-digit milliseconds typically, and within the budgets in `specs/web-experience`.
- Make ingestion deterministic and reproducible: the archive of raw responses plus the curated override files fully determine the published dataset.
- Keep the source's flaws visible (unattributed goals, doubtful dates, coverage figures) instead of hiding or "fixing" them.
- Run on one small VPS with few moving parts and one language (TypeScript) end to end.
- Keep the schema sport-aware so other sports can be added later without remodeling.

**Non-Goals:**
- Server-side rendering, SEO prerendering, or a CDN. These can be added later; the SPA plus HTTP caching meets the budgets.
- Horizontal scaling. The API is stateless and could scale, but one instance is planned.
- An admin UI for curation. Overrides are versioned YAML files reviewed through git.
- Near-real-time updates. The refresh is daily by design.

## Decisions

### D1. TypeScript monorepo with pnpm workspaces

```
apps/web         Vite + React SPA (shadcn/ui, Tailwind CSS v4, TanStack Router + Query)
apps/api         Fastify HTTP API (read-only)
apps/ingest      CLI: fetch → archive → normalize → build stats → publish
packages/domain  Pure normalization and classification rules + golden fixtures (no I/O)
packages/db      Drizzle schema & migrations, statistics SQL, publish/swap helpers
packages/contracts  TypeBox request/response schemas shared by api and web
data/overrides   team-aliases.yaml, phases.yaml, champions.yaml, display-names.yaml
deploy           docker-compose.yml, Caddyfile, cron entry, backup/deploy scripts
```

Node 24 LTS, Vitest, ESLint + Prettier, and strict TypeScript throughout.

*Alternatives:*
- Separate repositories were rejected: the API contracts and domain rules are shared.
- Nx or Turborepo is unnecessary at this size; `pnpm -r` scripts suffice.

### D2. Fastify API with schema-compiled serialization

Fastify 5 with the TypeBox type provider. Response schemas compile to `fast-json-stringify`, which is several times faster than `JSON.stringify` for large tables. The API is GET-only under `/api/v1`, with JSON responses that carry `meta.datasetVersion`. Invalid filter values are dropped and reported in `meta.ignoredFilters`, as `specs/search` requires. `@fastify/rate-limit` protects the VPS.

*Alternatives:*
- NestJS adds DI and decorator overhead and slower startup, with no benefit for a read-only API.
- Express is slower.
- tRPC would tie the API to TS clients and complicate HTTP caching.

### D3. PostgreSQL 18 with five schemas

PostgreSQL 18 with the `pg_trgm` and `unaccent` extensions. The data is relational: head-to-head is a self-join on matches, streaks need window functions, and leaderboards are filtered aggregates. It is also small enough to stay entirely in `shared_buffers`. MongoDB was rejected because it is a poorer fit for joins, window functions and trigram search.

| Schema | Lifecycle | Contents |
|---|---|---|
| `raw` | persistent | `responses` (request key unique, endpoint, params, status, body, content hash, fetched_at, changed_at) |
| `registry` | persistent, append-only | stable public IDs: players by `carne`, teams by canonical team key, tournaments and phases by natural key, plus slugs |
| `ops` | persistent | `ingest_runs` (trigger, status, counts, report JSON), `season_verification` (last verified per season) |
| `core` | rebuilt every publish | seasons, tournaments, phases, rounds, teams, players + name variants, venues, matches, appearances, goals, cards, substitutions, officials, official standings |
| `stats` | rebuilt every publish | read models (D5) and `search_index` |

A `meta.dataset` row holds the version, `published_at` and the run ID.

Drizzle ORM defines the schema and migrations and provides typed simple queries. Statistics are hand-written SQL files in `packages/db/stats/`, executed in order. Prisma was rejected for its heavier runtime and awkward raw SQL. Kysely would also work, but Drizzle gives schema, migrations and queries in one tool.

### D4. Full rebuild from the archive and atomic schema swap on every publish

The ingest work splits into two steps.

**Fetch.** This step writes only to `raw`, which the site never reads, so fetching can take minutes or hours without affecting visitors.

**Publish.** This step proceeds as follows:
1. Rebuild `core_next` from the whole archive, the override files and the registry.
2. Build `stats_next` from `core_next`.
3. Run the sanity gates. Abort if:
   - the match count dropped more than 1%;
   - a season disappeared;
   - a season has no phases;
   - a phase has rounds but no matches.
4. In one short transaction: rename `core`/`stats` to `core_prev`/`stats_prev` and the `_next` schemas into place, bump `meta.dataset`, and `NOTIFY dataset_published`.
5. Keep `*_prev` until the next publish so that `ingest rollback` can swap back.

Rebuilding everything is cheap at this size: about 25k archived documents and about 150k rows take well under a minute. It also removes a whole class of incremental-update bugs; curation changes, rule fixes and backfills all flow through one path.

Renaming schemas never touches in-flight queries, which keep reading the old objects. Postgres also invalidates cached plans on namespace changes. An integration test asserts that pooled connections read the new version after a swap.

*Alternatives:*
- Materialized views with `REFRESH … CONCURRENTLY`: each view refreshes separately, so readers could see inconsistent combinations of views.
- Version columns on every table: more index bloat, plus cleanup jobs.
- In-place incremental upserts: risk of partial states and drift from the rules.

### D5. Precomputed read models sized for filters

| Read model | Grain | Serves |
|---|---|---|
| `stats.player_match` | one row per appearance (W.O. excluded) | player, team, opponent, season, category, tournament, kind, result, goals, own goals, cards, captain, kickoff order |
| `stats.team_match` | two rows per match (W.O. included and flagged) | goals for and against, result, points, opponent, kickoff order |
| `stats.player_agg` | player × season × category × tournament × team | appearances, goals, own goals, yellow cards, red cards, captaincies, W/D/L, matches with three or more goals. Leaderboards with any filter combination sum ≤ 15k rows. |
| `stats.team_agg` | team × season × tournament | team totals |
| `stats.team_opponent_agg` | team × opponent × season × tournament | team-versus-all and team-versus-team summaries |
| `stats.player_opponent_agg` | player × opponent team × season | player-versus-teams tables |
| `stats.streaks`, `stats.milestones`, `stats.champions`, `stats.standings_by_round`, `stats.coverage` | various | streaks, milestones, champions, round-by-round standings, coverage figures |
| `stats.records_*` | precomputed lists | unfiltered all-time lists, served in O(1) |

**On demand from indexed facts.**
- Player-versus-player is a self-join on `player_match` by `match_id` with opposite teams. Each player has at most a few hundred rows, so this is sub-millisecond.
- Streaks over custom year ranges use gaps-and-islands window functions over at most a few hundred `team_match` rows.

**Indexes.** B-tree indexes on every filter and foreign-key column, plus composite indexes matching the query shapes, e.g. `player_agg(season_year, category, player_id)` and `player_match(player_id, kickoff_order)`. Search uses a GIN trigram index on the unaccented normalized text.

**Chronological order.** The `kickoff_order` key is (season year, listing kickoff, match ID), as `specs/data-ingestion` requires.

### D6. Domain rules as pure, golden-tested functions (`packages/domain`)

**Name normalization.** Unicode NFD, strip accents, uppercase, collapse whitespace, trim. Normalized names are used for team keys, card matching and search.

**Display names.**
- Players get Spanish-aware title case: "Juan Pablo Pérez" stays without invented accents, and particles such as "de", "del", "la" are lowercased.
- Teams get title case with an acronym list (ORT, UGAB, ACJ, …) and dotted acronyms preserved (C.U.B.A.).
- `display-names.yaml` overrides both.

**Season year.** Parsed with `/A[ÑN]O\s+(\d{4})/i`; otherwise code + 1913. Any other text is the dedication.

**Category.** Taken from `categoria`.

**Phase role and tournament kind.** Ordered keyword rules, first match wins:
1. third-place (`3º|TERCER`)
2. Plata
3. Final anual / Universitario
4. Oro / título / play-off / play-in / cuartos / semis / repechaje
5. Apertura
6. Clausura (including the `CLA.` abbreviation)
7. Liga (rueda / clasificatorio / divisional / copa N)
8. Otro

The role is decided by `FINAL(ES)?` versus the league and knockout markers, and by the standings shape. `phases.yaml` overrides by `(season code, torneo label, serie name)`. A golden fixture lists all 186 observed series names with their expected kind and role. Unknown names fall into their own tournament and appear in the run report.

**Champion rule.** As in `specs/competitions`: a final phase is won on wins, then aggregate goal difference; otherwise the leader of the last league phase. Third-place phases are excluded, and `champions.yaml` overrides.

**Scores and goals.** The listing score is authoritative. Unattributed goals = max(0, score − events), stored as per-side counts on the match rather than as fake rows. When events exceed the score, the match gets `inconsistent=true`.

**Own goals.** A goal is an own goal when the scorer's `carne` is in the opposite lineup.

**Cards.** Attributed by normalized-name equality with the same side's lineup, then the other side's. If a name matches two players in the same lineup, the card stays unresolved.

**Placeholders.** `CANCHA A FIJAR` and `A A ,FEDERACION` become NULL. Walk-overs and doubtful dates are flagged.

### D7. Polite fetcher with the archive as checkpoint

**HTTP behavior.**
- undici with a concurrency limiter, default 4, configurable per command.
- 30 s timeout; 4 attempts with exponential backoff and jitter; a circuit breaker after 20 consecutive failures.
- User-Agent `Ligapedia/<version> (+<site URL>; <contact from LIGAPEDIA_CONTACT>)`.

**Validation.** Responses are validated against TypeBox shapes. An unexpected shape is a hard failure for that item, so a silent source redesign can never publish garbage.

**Resume.** A backfill skips request keys already archived with status 200 since the backfill's start marker, so re-running continues where it stopped.

**Request key.** The endpoint plus sorted parameters. Bodies are hashed with SHA-256, and `changed_at` moves only when the hash changes.

### D8. Daily refresh orchestration (`ingest daily`)

1. Take `pg_try_advisory_lock`. If it is held, exit 0 with status "skipped: running".
2. Check whether `ops.ingest_runs` already has a succeeded scheduled or forced run for `(now() AT TIME ZONE 'America/Montevideo')::date`. If so, exit 0 with status "skipped: already refreshed today", unless `--force` was given.
3. Plan the fetch:
   - **Active seasons.** These are the newest listed season, plus seasons with matches in the last 60 days or in the future. Re-list them fully and refresh their standings.
   - **Match details.** Fetch them for new matches, for matches whose listing row hash changed, and for matches played in the last 14 days.
   - **Rotation.** Re-verify the least recently verified historical season in full (about 90 matches, roughly 6 min at concurrency 4).
   - **New seasons.** Detect new season codes via `cargarTemporadas`.
4. Abort before publishing when more than 20% of requests failed after retries.
5. Publish (D4) and update `ops.season_verification`.
6. Write the run report to `ops.ingest_runs` and stdout, and exit non-zero on failure.

Expected nightly load is about 1,200 requests, which takes about 10 minutes.

Other commands share the lock: `backfill [--from --to]`, `season <year>`, `rebuild` (normalize and stats from the archive, no network), `rollback`, `migrate`.

### D9. Serving speed and caching

**API caching.** An in-process LRU is keyed by `datasetVersion + route + canonicalized query`. Each entry holds the already-serialized body and a strong ETag `"v<version>-<hash>"`. Responses carry `Cache-Control: no-cache`, so browsers always revalidate and get a ~1 ms 304. The API clears its cache on `LISTEN dataset_published`, with a 30 s version poll as a fallback.

**Static assets.** Caddy serves `/assets/*` (content-hashed) with `Cache-Control: public, max-age=31536000, immutable`, and `index.html` with `no-cache`. Responses are compressed with zstd/gzip.

**Database tuning.** `shared_buffers` sized to hold the whole database, and a `Server-Timing` header on every API response for budget checks.

**Client.**
- TanStack Query with `staleTime` 5 min: back navigation renders instantly from cache.
- TanStack Router loaders with `defaultPreload: 'intent'` prefetch route code and data on hover or touch, so most navigations are already resolved on click.
- Route-level code splitting. Recharts (shadcn charts) and cmdk load lazily so the first route stays under 200 KB gzip.
- A self-hosted variable font that is preloaded and subset to Latin.

*Alternative:* `max-age` until the next 03:00 was rejected. A manual or forced refresh would then leave clients stale for up to a day, violating "next request gets new data".

### D10. Frontend structure

Vite + React 19 + TypeScript, shadcn/ui (`npx shadcn@latest init -t vite`, Tailwind v4 via `@tailwindcss/vite`), TanStack Router with file-based routes and typed, validated search params, and TanStack Query. The UI uses these shadcn/ui components:
- tables: shadcn data-table pattern on TanStack Table;
- search palette: Command (cmdk);
- charts: Chart (Recharts);
- profile tabs: Tabs;
- notices: Badge and Tooltip.

**Spanish strings.** Centralized in `src/lib/i18n/es.ts`; there is no i18n framework because there is only one language. Formatting uses `Intl.DateTimeFormat('es-UY', { timeZone: 'America/Montevideo' })` and `Intl.NumberFormat('es-UY')`.

**Theme.** shadcn's class strategy, with the preference persisted in `localStorage` and following `prefers-color-scheme` by default.

**Routes.**
- `/`
- `/temporadas`, `/temporadas/$anio`
- `/torneos`, `/torneos/$torneo`, `/torneos/$torneo/fases/$fase`
- `/partidos/$id`
- `/equipos`, `/equipos/$equipo` (tabs: resumen, temporadas, plantel, partidos, rivales, líderes)
- `/jugadores`, `/jugadores/$jugador` (tabs: resumen, temporadas, partidos, rivales, hitos)
- `/comparar/equipos`, `/comparar/jugadores`
- `/records` and its sub-lists
- `/campeones`
- `/buscar`
- `/sobre-los-datos`

Entity params are `<registryId>-<slug>`. A mismatched slug redirects to the canonical one, and the membership card number never appears.

Filter search params use Spanish names across all pages: `temporada`, `desde`, `hasta`, `rama`, `torneo`, `tipo`, `equipo`, `rival`, `top`, `min`, `orden`.

### D11. Search

`stats.search_index` holds one row per player, player name variant, team and tournament, with label, normalized text, entity link and context (years, teams). The query AND-matches each token, which lets tokens appear in any order. A GIN trigram index makes the matching fast, and it falls back to `word_similarity` for typos. Results are ordered by exact prefix, then similarity, then popularity (appearances or matches), with at most 10 per group. An `IMMUTABLE` wrapper around `unaccent` allows the expression index.

### D12. Deployment on the owner's VPS (Docker Compose)

**Services.**
- `db`: postgres:18, with a named volume. It is never published to the host network.
- `api`: Node 24, runs Fastify.
- `web`: Caddy 2. It serves the SPA with an `index.html` fallback, reverse-proxies `/api/*` to `api`, provides automatic HTTPS for `LIGAPEDIA_DOMAIN`, and sets security headers (strict CSP with `'self'` only, HSTS).
- `ingest`: the same image as `api`, with the CLI entrypoint and compose profile `jobs`, so `up` never starts it.

**Database roles.** `ligapedia_ingest` owns the schemas. `ligapedia_api` can only `SELECT` on `core`, `stats` and `meta`.

**Scheduling.** The host cron file `/etc/cron.d/ligapedia` runs `docker compose --profile jobs run --rm ingest daily`. `deploy/install-cron.sh` reads the host timezone (`timedatectl`) and writes the right minute and hour:
- `0 3 * * *` if the host is on America/Montevideo;
- `0 6 * * *` if it is on UTC;
- otherwise it refuses and asks the operator to set one of those two.

The once-per-day guard (D8) makes double triggers harmless.

**Logs and backups.**
- Logs are appended to `/var/log/ligapedia/ingest.log`, with a `logrotate` stanza.
- After each successful publish, `pg_dump` of `registry`, `raw` and `ops` goes to `/var/backups/ligapedia`, keeping 7 copies. These hold the irreplaceable state: stable URLs and hours of crawling. `core` and `stats` are rebuildable.

**Health.** `GET /api/health` returns DB status, the dataset version and the age of the last refresh, for an external uptime monitor.

### D13. Sport dimension

`registry` keys and `core.tournaments` carry `sport` (currently always `FUTSAL`). The fetcher takes the sport label as a parameter, and all URLs and queries are implicitly futsal. Adding a sport later means adding a sport segment to the routes and running the crawler with another label; the tables do not change.

### D14. Testing strategy

| Layer | Tests |
|---|---|
| Unit (Vitest, `packages/domain`) | Golden table of the 186 observed phase names; season-year parsing of `Año 2006`, `AÑO 2019`, `Temporada 110 "Año 2023"`, `RAFAEL "CANARIO" GARCÍA`; name normalization; card attribution including ambiguity; own goals (fixture: match 19906); unattributed and inconsistent goals; walk-over (fixture: match 55623); doubtful dates; champion rule for single, two-legged and undetermined finals |
| Fixtures | Real archived responses for a handful of matches and one full small phase, stored under `packages/domain/test/fixtures` |
| Integration (Testcontainers Postgres) | Normalize → stats → publish; schema swap with pooled connections; sanity gates; advisory lock; once-per-day guard in Montevideo time; rollback |
| API (Fastify `inject`) | Contract schemas, ETag/304, invalid filters, 404s, membership card numbers absent from every payload |
| E2E (Playwright) | Spanish smoke tests of main pages; 360 px no-horizontal-scroll check; keyboard navigation of a leaderboard |
| Performance | autocannon script over varied filters, reading `Server-Timing` p95; `size-limit` on the first-route bundle; Lighthouse CI (mobile) on home, player and team pages |

## Risks / Trade-offs

- **[Source changes shape or disappears]** → Responses are validated and a mismatch fails loudly. Sanity gates block publishing an emptied dataset. The raw archive preserves the full history even if the source goes away.
- **[Our load bothers the league's server]** → Concurrency is 4 at most. The backfill runs once, overnight, and can be split by season. Nightly load is about 1,200 requests at 03:00. The User-Agent identifies us with a contact.
- **[Phase/tournament grouping or champion heuristics are wrong for odd formats]** → Golden tests cover every observed name. Overrides in git, plus unknown names surfaced in each run report, make curation cheap. "Sobre los datos" explains how champions are determined.
- **[Team identity errors]** (renames, typos, the same institution under different spellings) → Normalized keys, `team-aliases.yaml`, and new team names listed in every run report. With 59 names today, a one-time review is enough.
- **[Incomplete source data]** (about a third of goals without scorer; yellow cards nearly absent) → The data is never fabricated. Unattributed goals stay visible, and coverage notices are computed per filter.
- **[Card attribution by name]** → Matching is exact on normalized names within one match only. Ambiguous or unknown names stay unresolved and are reported.
- **[Schema swap and prepared statements]** → An integration test covers it. As a fallback, the API can switch the pool to fresh connections on `dataset_published`.
- **[Single VPS is a single point of failure]** → Accepted for this project. Backups of the irreplaceable schemas are kept, and everything else can be rebuilt. A rebuild from the archive takes minutes; a re-crawl takes about 2 h.
- **[Personal data]** → Player names and match participation are already public on the league's site. Membership card numbers are never exposed. "Sobre los datos" offers a contact for corrections and removal requests.
- **[Bundle budget pressure from Radix and Recharts]** → Code-split heavy widgets and enforce `size-limit` in `pnpm verify`.

## Migration Plan

This is greenfield; there is no data migration. To roll out:
1. Provision the VPS: Docker Engine with the compose plugin, firewall open on 80/443 only, and a DNS A record for the chosen domain.
2. `docker compose up -d db`, then `docker compose --profile jobs run --rm ingest migrate`.
3. `… ingest backfill`, about 2–3 h and resumable. It ends with a publish.
4. `docker compose up -d api web` and verify the site, `/api/health`, and the budgets (perf script, Lighthouse).
5. `deploy/install-cron.sh`, then confirm the next 03:00 run in `/var/log/ligapedia/ingest.log`.

**Rollback.**
- A bad publish: `ingest rollback` swaps the `*_prev` schemas back.
- A bad deploy: re-deploy the previous image tag.
- The raw archive and registry are never rewritten destructively.

## Open Questions

- **Domain name and contact email.** Needed for Caddy HTTPS, the crawler User-Agent and "Sobre los datos". These are configuration only.
- **Which tournament kinds the owner considers "títulos" by default** on the champions ranking. All kinds are counted and filterable by kind, so the default is a one-line config change.
- **Display-name overrides and team aliases.** The first backfill's run report gives the list of names to review.
