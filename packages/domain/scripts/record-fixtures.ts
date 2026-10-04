/**
 * One-off recorder of real source responses used as test fixtures (task 3.1).
 * Usage: pnpm --filter @ligapedia/domain exec tsx scripts/record-fixtures.ts
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DETAIL_ACTIONS, req, requestKey, requestUrl, type SourceRequest } from '../src/source/endpoints';

interface Recorded extends SourceRequest {
  status: number;
  body: string;
}

const out = new Map<string, Recorded>();
const UA = `Ligapedia-fixture-recorder (+${process.env.LIGAPEDIA_CONTACT ?? 'contact unset'})`;

async function fetchOne(r: SourceRequest): Promise<string> {
  const key = requestKey(r);
  const hit = out.get(key);
  if (hit) return hit.body;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(requestUrl(r), { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(30_000) });
      const body = await res.text();
      out.set(key, { ...r, status: res.status, body });
      return body;
    } catch (err) {
      if (attempt >= 4) throw err;
      await new Promise((ok) => setTimeout(ok, 1000 * 2 ** attempt));
    }
  }
}

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<unknown>): Promise<void> {
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) await fn(items[i++] as T);
    }),
  );
}

const list = (body: string): Array<Record<string, string>> => {
  try {
    const v = JSON.parse(body);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

// 1. Season list plus every season's FUTSAL tournaments and series (golden phase fixture input).
const seasons = list(await fetchOne(req.seasons())).map((s) => s.codigo as string);
await fetchOne(req.seasons('posiciones_historicas'));
await pool(
  seasons.filter((c) => Number(c) >= 93),
  4,
  async (code) => {
    for (const t of list(await fetchOne(req.tournaments(code)))) await fetchOne(req.series(code, t.nombre!));
  },
);

// 2. Full phases: listing, rounds, every match's 12 detail actions, official standings.
const phases: Array<{ t: string; torneo: string; serie: string; fechas?: string[]; ids?: string[] }> = [
  { t: '112', torneo: 'FUTSAL', serie: 'APERTURA' },
  { t: '112', torneo: 'FUTSAL', serie: 'APERTURA SERIE 1' },
  { t: '112', torneo: 'FUTSAL', serie: 'APERTURA - SERIE 2' },
  { t: '112', torneo: 'FUTSAL', serie: 'FINAL DEL APERTURA' },
  // Single matches with known quirks, with their listing context:
  { t: '96', torneo: 'MAYORES', serie: 'Futbol Sala 1ª Rueda', fechas: ['2'], ids: ['19906'] }, // own goal
  { t: '97', torneo: 'MAYORES', serie: 'Torneo Futsal 2010', fechas: ['9'], ids: ['24293'] }, // red cards
  { t: '104', torneo: 'FUTSAL', serie: 'CLAUSURA', fechas: ['5'], ids: ['55623'] }, // walk-over
];
const matchIds: string[] = [];
for (const p of phases) {
  const fechas = p.fechas ?? list(await fetchOne(req.rounds(p.t, p.torneo, p.serie))).map((f) => f.fecha!);
  await fetchOne(req.rounds(p.t, p.torneo, p.serie));
  for (const f of fechas) {
    const rows = list(await fetchOne(req.matches(p.t, p.torneo, p.serie, f)));
    matchIds.push(...rows.map((m) => m.ID!).filter((id) => !p.ids || p.ids.includes(id)));
  }
  if (!p.ids) await fetchOne(req.standings(p.t, p.torneo, p.serie));
}
await pool(
  matchIds.flatMap((id) => DETAIL_ACTIONS.map((a) => req.detail(a, id))),
  4,
  (r) => fetchOne(r),
);

const file = fileURLToPath(new URL('../test/fixtures/responses.json', import.meta.url));
const sorted = [...out.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
writeFileSync(file, JSON.stringify(sorted, null, 1) + '\n');
console.log(`recorded ${sorted.length} responses (${matchIds.length} matches) → ${file}`);
