import postgres from 'postgres';

export type Sql = postgres.Sql;
export type TransactionSql = postgres.TransactionSql;

export interface ConnectionOptions {
  max?: number;
  /** Application name visible in pg_stat_activity. */
  appName?: string;
}

export function createSql(url: string, options: ConnectionOptions = {}): Sql {
  return postgres(url, {
    max: options.max ?? 10,
    onnotice: () => {},
    connection: { application_name: options.appName ?? 'ligapedia' },
    // Note: no custom `types` here — it replaces postgres.js's default parsers (dates, json).
    // Aggregates are cast to ::int in SQL instead.
    transform: { undefined: null },
  });
}

/** Quote an SQL identifier (schema names are generated, never user input, but stay safe). */
export function ident(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Invalid identifier: ${name}`);
  return `"${name}"`;
}
