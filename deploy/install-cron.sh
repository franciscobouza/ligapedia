#!/usr/bin/env bash
# Install the daily refresh at 03:00 America/Montevideo (design D12).
# Uruguay has used UTC−03:00 year-round since 2015, so 03:00 Montevideo = 06:00 UTC.
#
#   sudo deploy/install-cron.sh            install /etc/cron.d/ligapedia and the logrotate stanza
#   deploy/install-cron.sh --dry-run       print what would be installed
#
# Env overrides (mainly for tests): LIGAPEDIA_DIR (repo path), LIGAPEDIA_HOST_TZ (host time zone),
# CRON_FILE, LOGROTATE_FILE, LOG_DIR.
set -euo pipefail

DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

LIGAPEDIA_DIR="${LIGAPEDIA_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
CRON_FILE="${CRON_FILE:-/etc/cron.d/ligapedia}"
LOGROTATE_FILE="${LOGROTATE_FILE:-/etc/logrotate.d/ligapedia}"
LOG_DIR="${LOG_DIR:-/var/log/ligapedia}"
RUN_USER="${RUN_USER:-root}"

detect_tz() {
  if [[ -n "${LIGAPEDIA_HOST_TZ+set}" ]]; then echo "$LIGAPEDIA_HOST_TZ"; return; fi
  if command -v timedatectl >/dev/null 2>&1; then
    timedatectl show -p Timezone --value 2>/dev/null && return
  fi
  if [[ -f /etc/timezone ]]; then cat /etc/timezone; return; fi
  readlink /etc/localtime 2>/dev/null | sed 's#.*/zoneinfo/##'
}

TZ_NAME="$(detect_tz | tr -d '[:space:]')"
case "$TZ_NAME" in
  America/Montevideo) SCHEDULE="0 3 * * *" ;;
  UTC|Etc/UTC|Etc/Universal|Universal|Zulu|Etc/Zulu) SCHEDULE="0 6 * * *" ;;
  *)
    echo "Refusing to install: host time zone is '${TZ_NAME:-unknown}'." >&2
    echo "Set it to America/Montevideo or UTC first, e.g.: sudo timedatectl set-timezone UTC" >&2
    exit 1
    ;;
esac

COMPOSE="docker compose -f deploy/docker-compose.yml --env-file deploy/.env"
CRON_CONTENT="# Ligapedia daily refresh: 03:00 America/Montevideo (host time zone: ${TZ_NAME}).
# Installed by deploy/install-cron.sh — re-run it after changing the host time zone.
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
${SCHEDULE} ${RUN_USER} cd ${LIGAPEDIA_DIR} && ${COMPOSE} --profile jobs run --rm ingest daily --scheduled >> ${LOG_DIR}/ingest.log 2>&1; ${LIGAPEDIA_DIR}/deploy/backup.sh >> ${LOG_DIR}/backup.log 2>&1
"

LOGROTATE_CONTENT="${LOG_DIR}/*.log {
  weekly
  rotate 12
  compress
  missingok
  notifempty
  copytruncate
}
"

if [[ $DRY_RUN -eq 1 ]]; then
  echo "### ${CRON_FILE}"
  printf '%s' "$CRON_CONTENT"
  echo "### ${LOGROTATE_FILE}"
  printf '%s' "$LOGROTATE_CONTENT"
  exit 0
fi

mkdir -p "$LOG_DIR"
printf '%s' "$CRON_CONTENT" > "$CRON_FILE"
chmod 0644 "$CRON_FILE"
printf '%s' "$LOGROTATE_CONTENT" > "$LOGROTATE_FILE"
echo "Installed ${CRON_FILE} (${SCHEDULE}, host time zone ${TZ_NAME}) and ${LOGROTATE_FILE}."
