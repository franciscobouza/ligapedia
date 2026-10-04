#!/usr/bin/env bash
# Tests for install-cron.sh time zone handling. Run: deploy/test-install-cron.sh
set -uo pipefail
cd "$(dirname "$0")"
fail=0
check() { # name expected-exit expected-substring tz
  local out code
  out="$(LIGAPEDIA_HOST_TZ="$4" LIGAPEDIA_DIR=/opt/ligapedia ./install-cron.sh --dry-run 2>&1)"; code=$?
  if [[ $code -ne $2 || "$out" != *"$3"* ]]; then echo "FAIL $1 (exit $code)"; echo "$out"; fail=1; else echo "ok   $1"; fi
}
check "Montevideo host → 03:00"  0 "0 3 * * * root cd /opt/ligapedia && docker compose" "America/Montevideo"
check "UTC host → 06:00"         0 "0 6 * * * root cd /opt/ligapedia"                  "UTC"
check "Etc/UTC host → 06:00"     0 "0 6 * * *"                                          "Etc/UTC"
check "other zone refused"       1 "Refusing to install"                                "Europe/Madrid"
check "unknown zone refused"     1 "Refusing to install"                                ""
check "runs the scheduled daily" 0 "run --rm ingest daily --scheduled"                  "UTC"
check "logs and backs up"        0 "/var/log/ligapedia/ingest.log"                      "UTC"
exit $fail
