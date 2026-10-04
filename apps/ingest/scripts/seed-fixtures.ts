/**
 * Dev utility: publish the recorded test fixtures into DATABASE_URL_INGEST (an empty database),
 * to work on the UI without a full backfill. Usage: tsx scripts/seed-fixtures.ts
 */
import { createSql, runMigrations } from '@ligapedia/db';
import { emptyOverrides } from '@ligapedia/domain';
import { seedArchiveFromFixtures } from '../test/mock-source';
import { buildAndPublish } from '../src/pipeline';
import { emptyReport } from '../src/runs';

const url = process.env.DATABASE_URL_INGEST;
if (!url) throw new Error('DATABASE_URL_INGEST is required');
await runMigrations(url);
const sql = createSql(url, { max: 4 });
const n = await seedArchiveFromFixtures(sql);
const r = await buildAndPublish(sql, emptyOverrides(), null, emptyReport());
console.log(`archived ${n} fixture responses; published version ${r.version}`, r.counts);
await sql.end();
