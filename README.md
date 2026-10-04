# Ligapedia

Enciclopedia (no oficial) del futsal de la Liga Universitaria de Deportes (LUD): every match, lineup, goal, card and standings table since 2006, with player and team profiles, head-to-head comparisons, records and champions. The site is in Spanish; this README is for operators and developers.

Planning artifacts (proposal, specs, design, tasks) live in [`openspec/changes/add-futsal-encyclopedia`](openspec/changes/add-futsal-encyclopedia).

## Architecture

| Part | What it does |
|---|---|
| `apps/ingest` | CLI: crawls the league's JSON endpoints into a raw archive, normalizes it, builds statistics, publishes atomically |
| `apps/api` | Fastify read-only JSON API (`/api/v1/*`), cached per dataset version |
| `apps/web` | Vite + React SPA (TanStack Router/Query, shadcn/ui, Tailwind CSS) |
| `packages/domain` | Pure normalization rules (names, phases, champions, match events) + golden fixtures |
| `packages/db` | Drizzle migrations for persistent schemas, DDL for `core`/`stats`, statistics SQL |
| `packages/contracts` | TypeBox API schemas shared by API and web |
| `data/overrides` | Curated YAML corrections (team aliases, phase grouping, champions, display names) |
| `deploy` | Docker images, production compose, Caddy, cron, backup/restore scripts |

PostgreSQL schemas: `raw` (verbatim archive), `registry` (stable public IDs), `ops` (run history), `meta` (live dataset version) are persistent; `core` and `stats` are rebuilt from the archive on every publish and swapped in atomically (the previous pair is kept as `*_prev` for `rollback`).

## Development

Requirements: Node 22.12+ (24 in production), pnpm 10, Docker.

```bash
pnpm install
docker compose -f docker-compose.dev.yml up -d db
cp .env.example .env
```

Publish data locally, either the small recorded fixture set (seconds) or the real history (hours):

```bash
# fixtures into a separate database
docker compose -f docker-compose.dev.yml exec -T db psql -U postgres -c "CREATE DATABASE ligapedia_ui OWNER ligapedia_ingest" -c "GRANT CONNECT ON DATABASE ligapedia_ui TO ligapedia_api"
cd apps/ingest && DATABASE_URL_INGEST=postgres://ligapedia_ingest:ingest@127.0.0.1:54329/ligapedia_ui npx tsx scripts/seed-fixtures.ts
```

```bash
# full history from the league's site (resumable; about 4 hours at concurrency 4)
cd apps/ingest && set -a && . ../../.env && set +a && npx tsx src/cli.ts migrate && npx tsx src/cli.ts backfill
```

Run the API (`apps/api`: `DATABASE_URL_API=... npx tsx watch src/server.ts`) and the web app (`apps/web`: `npx vite`, proxies `/api` to port 3000).

Checks:

```bash
pnpm verify          # lint, typecheck, unit + integration tests (Docker), first-route bundle size
pnpm test:e2e        # Playwright against the fixture database (API + Vite started automatically)
```

## Ingest commands

All commands share one advisory lock (never two at once) and are recorded in `ops.ingest_runs`.

| Command | Purpose |
|---|---|
| `migrate` | Apply database migrations |
| `backfill [--from Y] [--to Y]` | Full historical crawl (resumes an interrupted run), then publish |
| `season <year>` | Re-crawl one season, then publish |
| `daily [--force] [--scheduled]` | The 03:00 refresh; at most one successful run per Montevideo calendar day unless `--force` |
| `rebuild` | Re-normalize and rebuild statistics from the archive (no network), then publish |
| `rollback` | Swap the live dataset with the previous one |

## Production runbook (VPS with Docker Compose)

Commands below run from the repository checkout on the server (e.g. `/opt/ligapedia`); `$C` stands for `docker compose -f deploy/docker-compose.yml --env-file deploy/.env`.

### First deploy

1. Server: Docker Engine + compose plugin; firewall open on 80/443 only; DNS A record for the domain; host time zone UTC or America/Montevideo (`timedatectl`).
2. `git clone … /opt/ligapedia && cd /opt/ligapedia && cp deploy/.env.example deploy/.env` and fill in the domain, contact and passwords.
3. `deploy/deploy.sh` — builds images, starts PostgreSQL, migrates, starts API and Caddy (HTTPS is automatic).
4. Backfill the history (hours; safe to re-run if interrupted): `$C --profile jobs run --rm ingest backfill`
5. Check `https://<domain>/api/health` and the site.
6. Install the daily schedule: `sudo deploy/install-cron.sh` (writes `/etc/cron.d/ligapedia` at 03:00 Montevideo — `0 3` on a Montevideo host, `0 6` on a UTC host — plus logrotate). The next morning confirm a `succeeded` scheduled run in `ops.ingest_runs` and the new "Datos actualizados" time in the footer.

### Updating

`deploy/deploy.sh` (pull, build, migrate, restart). Roll back a bad deploy by checking out the previous commit and running `NO_PULL=1 deploy/deploy.sh`.

### Data operations

- Forced refresh: `$C --profile jobs run --rm ingest daily --force`
- One season: `$C --profile jobs run --rm ingest season 2025`
- Bad publish: `$C --profile jobs run --rm ingest rollback`
- Logs: `/var/log/ligapedia/ingest.log` (each run prints a summary), `/var/log/ligapedia/backup.log`, `$C logs api web`.

### Curation workflow

Every run summary lists unrecognized phase names, new team names, unresolved cards and inconsistent matches. To correct presentation:

1. Edit `data/overrides/*.yaml` (see comments in each file): `phases.yaml` (tournament/role of a series), `team-aliases.yaml` (merge spellings), `champions.yaml` (force or clear a champion), `display-names.yaml` (accents, acronyms).
2. Apply without network access: `$C --profile jobs run --rm ingest rebuild`. Overrides are mounted read-only into the ingest container, so no image rebuild is needed.

### Backups and restore

After each scheduled run, `deploy/backup.sh` dumps `registry`, `raw` and `ops` to `/var/backups/ligapedia` when a new dataset version was published (keeps 7). These hold the irreplaceable state (stable URLs and the archive); `core`/`stats` are rebuilt from them.

Restore onto an empty database: `deploy/restore.sh /var/backups/ligapedia/ligapedia-<…>.dump` (migrates, restores data, runs `ingest rebuild`). Player and team URLs stay identical.

## Data notes

See the site's "Sobre los datos" page: final scores are authoritative and missing scorers appear as "Gol sin autor registrado"; minutes are verbatim; yellow cards are rarely recorded by the source; walk-overs count for results but not for player stats or match records.
