#!/usr/bin/env bash
# Deploy or update Ligapedia on the VPS: pull, build, migrate, restart (design "Migration Plan").
#   deploy/deploy.sh            normal deploy
#   NO_PULL=1 deploy/deploy.sh  deploy the current checkout as is
set -euo pipefail
cd "$(dirname "$0")/.."

[[ -f deploy/.env ]] || { echo "Missing deploy/.env (copy deploy/.env.example and fill it in)." >&2; exit 1; }
COMPOSE=(docker compose -f deploy/docker-compose.yml --env-file deploy/.env)

if [[ "${NO_PULL:-0}" != "1" ]]; then
  git pull --ff-only
fi

echo "==> Building images"
"${COMPOSE[@]}" build api web

echo "==> Starting the database"
"${COMPOSE[@]}" up -d db

echo "==> Applying migrations"
"${COMPOSE[@]}" --profile jobs run --rm ingest migrate

echo "==> Starting API and web"
"${COMPOSE[@]}" up -d api web

echo "==> Waiting for the API health check"
for _ in $(seq 1 30); do
  if "${COMPOSE[@]}" exec -T api wget -qO- http://127.0.0.1:3000/api/health 2>/dev/null; then
    echo
    "${COMPOSE[@]}" ps
    exit 0
  fi
  sleep 2
done
echo "API did not become healthy; check: ${COMPOSE[*]} logs api" >&2
exit 1
