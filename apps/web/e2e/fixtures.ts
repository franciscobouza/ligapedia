import { test as base } from '@playwright/test';
import postgres from 'postgres';

/** Ids looked up in the fixture database the API serves. */
export interface Ids {
  aleman: string;
  hebraica: string;
  bohemios: string;
  lourdes: string;
  ort: string;
  apertura2025: string;
  phaseApertura: string;
  player: { id: number; slug: string; name: string; carne: string };
  playerOld: { id: number; slug: string };
}

let cached: Ids | undefined;

async function lookup(): Promise<Ids> {
  if (cached) return cached;
  const sql = postgres(process.env.E2E_DATABASE_URL_INGEST ?? 'postgres://ligapedia_ingest:ingest@127.0.0.1:54329/ligapedia_ui', { max: 1, onnotice: () => {} });
  try {
    const team = async (name: string) => {
      const [t] = await sql<{ id: number; slug: string }[]>`SELECT id, slug FROM core.teams WHERE name = ${name} AND category = 'M'`;
      return `${t!.id}-${t!.slug}`;
    };
    const [t] = await sql<{ id: number; slug: string }[]>`SELECT id, slug FROM core.tournaments WHERE season_year = 2025 AND kind = 'apertura'`;
    const [ph] = await sql<{ id: number }[]>`SELECT id FROM core.phases WHERE season_year = 2025 AND source_serie = 'APERTURA'`;
    const [p] = await sql<{ id: number; slug: string; name: string; carne: string }[]>`
      SELECT p.id, p.slug, p.display_name AS name, p.carne FROM core.players p
      JOIN core.appearances a ON a.player_id = p.id WHERE a.match_id = 92923 AND a.side = 'H' AND a.captain`;
    const [old] = await sql<{ id: number; slug: string }[]>`
      SELECT p.id, p.slug FROM core.players p JOIN core.appearances a ON a.player_id = p.id WHERE a.match_id = 19906 LIMIT 1`;
    cached = {
      aleman: await team('ALEMAN UNIVERSITARIO'),
      hebraica: await team('HEBRAICA UNIVERSITARIO'),
      bohemios: await team('BOHEMIOS FS'),
      lourdes: await team('NUESTRA SEÑORA DE LOURDES'),
      ort: await team('UNIVERSIDAD ORT'),
      apertura2025: `${t!.id}-${t!.slug}`,
      phaseApertura: String(ph!.id),
      player: p!,
      playerOld: old!,
    };
    return cached;
  } finally {
    await sql.end();
  }
}

export const test = base.extend<{ ids: Ids }>({
  // eslint-disable-next-line no-empty-pattern
  ids: async ({}, use) => use(await lookup()),
});
export { expect } from '@playwright/test';
