CREATE SCHEMA "meta";
--> statement-breakpoint
CREATE SCHEMA "ops";
--> statement-breakpoint
CREATE SCHEMA "raw";
--> statement-breakpoint
CREATE SCHEMA "registry";
--> statement-breakpoint
CREATE TABLE "meta"."dataset" (
	"id" integer PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"published_at" timestamp with time zone,
	"run_id" integer,
	"counts" jsonb
);
--> statement-breakpoint
CREATE TABLE "ops"."ingest_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"command" text NOT NULL,
	"trigger" text NOT NULL,
	"forced" boolean DEFAULT false NOT NULL,
	"status" text NOT NULL,
	"montevideo_date" date NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"dataset_version" integer,
	"counts" jsonb,
	"report" jsonb,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "ops"."state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registry"."phases" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "phases_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "registry"."players" (
	"id" serial PRIMARY KEY NOT NULL,
	"carne" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_carne_unique" UNIQUE("carne")
);
--> statement-breakpoint
CREATE TABLE "registry"."teams" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "registry"."tournaments" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tournaments_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "raw"."responses" (
	"key" text PRIMARY KEY NOT NULL,
	"endpoint" text NOT NULL,
	"action" text NOT NULL,
	"params" jsonb NOT NULL,
	"status" integer NOT NULL,
	"body" text NOT NULL,
	"content_hash" text NOT NULL,
	"first_fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ops"."season_verification" (
	"season_code" integer PRIMARY KEY NOT NULL,
	"verified_at" timestamp with time zone NOT NULL
);
