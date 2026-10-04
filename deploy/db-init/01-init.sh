#!/bin/sh
# Runs once, on first start of an empty data volume (docker-entrypoint-initdb.d).
# Creates the two application roles and the database owned by the ingest role.
set -eu
: "${LIGAPEDIA_INGEST_PASSWORD:?LIGAPEDIA_INGEST_PASSWORD is required}"
: "${LIGAPEDIA_API_PASSWORD:?LIGAPEDIA_API_PASSWORD is required}"
DB="${LIGAPEDIA_DB:-ligapedia}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<SQL
CREATE ROLE ligapedia_ingest LOGIN PASSWORD '${LIGAPEDIA_INGEST_PASSWORD}';
CREATE ROLE ligapedia_api LOGIN PASSWORD '${LIGAPEDIA_API_PASSWORD}';
CREATE DATABASE "${DB}" OWNER ligapedia_ingest;
REVOKE ALL ON DATABASE "${DB}" FROM PUBLIC;
GRANT CONNECT ON DATABASE "${DB}" TO ligapedia_api;
SQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$DB" <<SQL
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SQL
