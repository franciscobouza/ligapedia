#!/usr/bin/env bash
# Post-publish backup (design D12): dump the irreplaceable schemas — registry (stable public IDs),
# raw (hours of crawling) and ops (run history). core/stats are rebuilt from them with `ingest rebuild`.
# Runs after the daily refresh (see install-cron.sh); only dumps when a new dataset version was published.
#
# Env: BACKUP_DIR (default /var/backups/ligapedia), KEEP (default 7), DB_NAME (default ligapedia),
#      LIGAPEDIA_COMPOSE (override the compose command, e.g. for local tests).
set -euo pipefail

DIR="${LIGAPEDIA_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/ligapedia}"
KEEP="${KEEP:-7}"
DB_NAME="${DB_NAME:-ligapedia}"
COMPOSE="${LIGAPEDIA_COMPOSE:-docker compose -f $DIR/deploy/docker-compose.yml --env-file $DIR/deploy/.env}"

mkdir -p "$BACKUP_DIR"
version="$($COMPOSE exec -T db psql -U postgres -d "$DB_NAME" -At -c 'SELECT version FROM meta.dataset WHERE id = 1')"
last="$(cat "$BACKUP_DIR/.last-version" 2>/dev/null || echo none)"
if [[ "$version" == "0" || "$version" == "$last" ]]; then
  echo "$(date -u +%FT%TZ) backup skipped: no new dataset (version $version)"
  exit 0
fi

file="$BACKUP_DIR/ligapedia-$(date -u +%Y%m%dT%H%M%SZ)-v${version}.dump"
$COMPOSE exec -T db pg_dump -U postgres -d "$DB_NAME" --format=custom \
  --schema=registry --schema=raw --schema=ops > "$file.tmp"
mv "$file.tmp" "$file"
echo "$version" > "$BACKUP_DIR/.last-version"

# Keep the newest $KEEP dumps.
ls -1t "$BACKUP_DIR"/ligapedia-*.dump 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do rm -f -- "$old"; done
echo "$(date -u +%FT%TZ) backup written: $file ($(du -h "$file" | cut -f1))"
