import type { Sql } from '@ligapedia/db';
import type { CoreDraft } from './build';

export interface IdMaps {
  players: Map<string, number>;
  teams: Map<string, number>;
  tournaments: Map<string, number>;
  phases: Map<string, number>;
  /** Natural keys that received a new registry ID in this run. */
  created: { players: string[]; teams: string[]; tournaments: string[]; phases: string[] };
}

async function assign(
  sql: Sql,
  table: 'players' | 'teams' | 'tournaments' | 'phases',
  keyColumn: 'carne' | 'key',
  entries: Array<{ key: string; slug: string }>,
): Promise<{ map: Map<string, number>; created: string[] }> {
  const existing = await sql<{ k: string; id: number }[]>`
    SELECT ${sql(keyColumn)} AS k, id FROM ${sql('registry')}.${sql(table)}`;
  const map = new Map(existing.map((r) => [r.k, r.id]));
  const missing = entries.filter((e) => !map.has(e.key));
  const created: string[] = [];
  for (let i = 0; i < missing.length; i += 1000) {
    const chunk = missing.slice(i, i + 1000);
    const rows = await sql<{ k: string; id: number }[]>`
      INSERT INTO ${sql('registry')}.${sql(table)} (${sql(keyColumn)}, slug)
      SELECT * FROM unnest(${sql.array(chunk.map((c) => c.key))}::text[], ${sql.array(chunk.map((c) => c.slug))}::text[])
      ON CONFLICT (${sql(keyColumn)}) DO NOTHING
      RETURNING ${sql(keyColumn)} AS k, id`;
    for (const r of rows) {
      map.set(r.k, r.id);
      created.push(r.k);
    }
  }
  return { map, created };
}

/**
 * Give every player, team, tournament and phase a stable public ID. IDs are append-only:
 * once assigned they never change, so URLs survive every rebuild (design D3).
 */
export async function assignIds(sql: Sql, draft: CoreDraft): Promise<IdMaps> {
  const players = await assign(sql, 'players', 'carne', draft.players.map((p) => ({ key: p.carne, slug: p.slug })));
  const teams = await assign(sql, 'teams', 'key', draft.teams.map((t) => ({ key: t.key, slug: t.slug })));
  const tournaments = await assign(sql, 'tournaments', 'key', draft.tournaments.map((t) => ({ key: t.key, slug: t.slug })));
  const phases = await assign(sql, 'phases', 'key', draft.phases.map((p) => ({ key: p.key, slug: p.slug })));
  return {
    players: players.map,
    teams: teams.map,
    tournaments: tournaments.map,
    phases: phases.map,
    created: { players: players.created, teams: teams.created, tournaments: tournaments.created, phases: phases.created },
  };
}
