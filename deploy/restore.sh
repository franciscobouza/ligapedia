#!/usr/bin/env bash
# Restore a backup made by backup.sh into an empty, migrated database, then rebuild the dataset.
#   deploy/restore.sh /var/backups/ligapedia/ligapedia-...-v42.dump
# Steps: (1) `ingest migrate` creates the persistent schemas, (2) pg_restore loads registry/raw/ops data
# (including ID sequences), (3) `ingest rebuild` regenerates core/stats and publishes — same public URLs.
#
# Env: DB_NAME (default ligapedia), LIGAPEDIA_COMPOSE, SKIP_INGEST=1 (only restore data; used by tests).
set -euo pipefail

DUMP="${1:?usage: restore.sh <dump-file>}"
DIR="${LIGAPEDIA_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
DB_NAME="${DB_NAME:-ligapedia}"
COMPOSE="${LIGAPEDIA_COMPOSE:-docker compose -f $DIR/deploy/docker-compose.yml --env-file $DIR/deploy/.env}"

if [[ "${SKIP_INGEST:-0}" != "1" ]]; then
  $COMPOSE --profile jobs run --rm ingest migrate
fi
rows="$($COMPOSE exec -T db psql -U postgres -d "$DB_NAME" -At -c 'SELECT count(*) FROM registry.players')"
if [[ "$rows" != "0" ]]; then
  echo "Refusing to restore: registry.players already has $rows rows (restore needs an empty database)." >&2
  exit 1
fi
$COMPOSE exec -T db pg_restore -U postgres -d "$DB_NAME" --data-only --disable-triggers \
  --schema=registry --schema=raw --schema=ops < "$DUMP"
echo "Data restored from $DUMP."
if [[ "${SKIP_INGEST:-0}" != "1" ]]; then
  $COMPOSE --profile jobs run --rm ingest rebuild
fi
