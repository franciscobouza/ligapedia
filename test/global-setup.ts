import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import postgres from 'postgres';
import type { TestProject } from 'vitest/node';

let container: StartedPostgreSqlContainer | undefined;

import './db';

/** One PostgreSQL 18 container per test run; each test file creates its own database. */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  container = await new PostgreSqlContainer('postgres:18')
    .withUsername('postgres')
    .withPassword('postgres')
    .withDatabase('postgres')
    .start();
  const host = container.getHost();
  const port = container.getMappedPort(5432);
  const admin = postgres({ host, port, user: 'postgres', password: 'postgres', database: 'postgres', onnotice: () => {} });
  await admin.unsafe(`CREATE ROLE ligapedia_ingest LOGIN PASSWORD 'ingest' CREATEDB`);
  await admin.unsafe(`CREATE ROLE ligapedia_api LOGIN PASSWORD 'api'`);
  await admin.end();
  project.provide('pg', { host, port });
  return async () => {
    await container?.stop();
  };
}
