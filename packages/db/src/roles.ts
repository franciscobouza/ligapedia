import { ident, type Sql, type TransactionSql } from './connection';

export const API_ROLE = process.env.LIGAPEDIA_API_ROLE ?? 'ligapedia_api';

/**
 * Grant the read-only API role access to freshly built schemas. Grants belong to the schema
 * objects, so they travel with a schema when it is renamed during the publish swap.
 * No-op when the role does not exist (e.g. a developer database without roles).
 */
export async function grantApiRead(
  sql: Sql | TransactionSql,
  schemaNames: string[],
  role = API_ROLE,
): Promise<boolean> {
  const [exists] = await sql`select 1 as ok from pg_roles where rolname = ${role}`;
  if (!exists) return false;
  for (const name of schemaNames) {
    await sql.unsafe(`GRANT USAGE ON SCHEMA ${ident(name)} TO ${ident(role)}`);
    await sql.unsafe(`GRANT SELECT ON ALL TABLES IN SCHEMA ${ident(name)} TO ${ident(role)}`);
  }
  return true;
}
