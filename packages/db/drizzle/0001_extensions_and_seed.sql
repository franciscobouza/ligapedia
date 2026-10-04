-- Trusted extensions: the database owner (ligapedia_ingest) may create them.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint
-- unaccent() is only STABLE; this IMMUTABLE wrapper allows expression indexes.
CREATE OR REPLACE FUNCTION public.f_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $fn$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $fn$;
--> statement-breakpoint
INSERT INTO meta.dataset (id, version) VALUES (1, 0) ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ingest_runs_day_status_idx ON ops.ingest_runs (montevideo_date, status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS responses_action_idx ON raw.responses (action);
--> statement-breakpoint
DO $grant$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ligapedia_api') THEN
    GRANT USAGE ON SCHEMA meta TO ligapedia_api;
    GRANT SELECT ON ALL TABLES IN SCHEMA meta TO ligapedia_api;
  END IF;
END
$grant$;
