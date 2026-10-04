/**
 * Server speed budgets (specs/web-experience "Server speed budgets"), task 10.1.
 * Fires ≥1,000 distinct URLs per group with autocannon and reads each response's Server-Timing
 * (server processing time). Distinct URLs mean (almost) every request misses the response cache.
 *
 *   DATABASE_URL_INGEST=... API_URL=http://127.0.0.1:3000 tsx scripts/load-test.ts
 */
import autocannon from 'autocannon';
import postgres from 'postgres';

const API = process.env.API_URL ?? 'http://127.0.0.1:3000';
const N = Number(process.env.LOAD_N ?? 1000);
const sql = postgres(process.env.DATABASE_URL_INGEST!, { max: 2, onnotice: () => {} });

const rand = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)]!;
const players = (await sql<{ id: number; name: string }[]>`SELECT id, display_name AS name FROM core.players`);
const teams = (await sql<{ id: number; category: string }[]>`SELECT id, category FROM core.teams`).map((t) => t);
const years = (await sql<{ year: number }[]>`SELECT year FROM core.seasons`).map((s) => s.year);
const phases = (await sql<{ id: number }[]>`SELECT id FROM core.phases`).map((p) => p.id);
const tournaments = (await sql<{ id: number }[]>`SELECT id FROM core.tournaments`).map((t) => t.id);
await sql.end();

const METRICS = ['goles', 'partidos', 'rojas', 'amarillas', 'tarjetas', 'capitan', 'tripletes', 'temporadas', 'titulos', 'goles-por-partido', 'tarjetas-por-partido'];
const unique = (make: () => string, n = N): string[] => {
  const out = new Set<string>();
  for (let i = 0; out.size < n && i < n * 50; i++) out.add(make());
  return [...out];
};
const range = () => {
  const a = rand(years);
  const b = rand(years);
  return `desde=${Math.min(a, b)}&hasta=${Math.max(a, b)}`;
};

const groups: Array<{ name: string; budgetMs: number; urls: string[] }> = [
  {
    name: 'entities, lists, standings, leaderboards',
    budgetMs: 50,
    urls: [
      ...unique(() => `/api/v1/jugadores/${rand(players).id}?n=${Math.random()}`, N / 4),
      ...unique(() => `/api/v1/equipos/${rand(teams).id}?n=${Math.random()}`, N / 8),
      ...unique(() => `/api/v1/fases/${rand(phases)}?n=${Math.random()}`, N / 8),
      ...unique(() => `/api/v1/torneos/${rand(tournaments)}?n=${Math.random()}`, N / 8),
      ...unique(() => `/api/v1/temporadas/${rand(years)}?n=${Math.random()}`, N / 8),
      ...unique(() => `/api/v1/records/jugadores/${rand(METRICS)}?temporada=${rand(years)}&rama=${rand(['masculino', 'femenino'])}&top=${rand([10, 25, 50, 100])}&n=${Math.random()}`, N / 4),
    ],
  },
  {
    name: 'head-to-head and year-range aggregates',
    budgetMs: 150,
    urls: [
      ...unique(() => `/api/v1/comparar/jugadores?a=${rand(players).id}&b=${rand(players).id}`, N / 2),
      ...unique(() => {
        const a = rand(teams);
        const b = rand(teams.filter((t) => t.category === a.category));
        return `/api/v1/comparar/equipos?a=${a.id}&b=${b.id}&${range()}`;
      }, N / 4),
      ...unique(() => `/api/v1/records/jugadores/${rand(METRICS)}?${range()}&top=${rand([10, 25, 50, 100])}&n=${Math.random()}`, N / 8),
      ...unique(() => `/api/v1/equipos/${rand(teams).id}/rivales?${range()}`, N / 8),
    ],
  },
  {
    name: 'search',
    budgetMs: 100,
    urls: unique(() => {
      const name = rand(players).name.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
      const start = Math.floor(Math.random() * Math.max(1, name.length - 6));
      return `/api/v1/buscar?q=${encodeURIComponent(name.slice(start, start + 2 + Math.floor(Math.random() * 5)).trim() || 'ma')}&n=${Math.random()}`;
    }),
  },
];

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0;
};

let failed = false;
for (const g of groups) {
  const timings: number[] = [];
  const byKind: Record<string, number[]> = {};
  let errors = 0;
  const result = await autocannon({
    url: API,
    connections: 8,
    amount: g.urls.length,
    requests: [
      {
        setupRequest: (req, ctx) => {
          ctx.i = ((ctx.i as number | undefined) ?? Math.floor(Math.random() * g.urls.length)) + 1;
          return { ...req, method: 'GET', path: g.urls[(ctx.i as number) % g.urls.length]! };
        },
        onResponse: (status, _body, ctx, headers) => {
          if (status !== 200) errors++;
          const h = (headers as unknown as Record<string, string>)['server-timing'] ?? '';
          const m = /dur=([\d.]+)/.exec(h);
          if (m) {
            timings.push(Number(m[1]));
            const path = g.urls[(ctx.i as number) % g.urls.length]!;
            const kind = path.replace(/\?.*/, '').replace(/\/\d+/g, '/:id');
            (byKind[kind] ??= []).push(Number(m[1]));
          }
        },
      },
    ],
  });
  const p50 = pct(timings, 50);
  const p95 = pct(timings, 95);
  const ok = p95 <= g.budgetMs && errors === 0;
  failed ||= !ok;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${g.name.padEnd(42)} n=${timings.length} p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms max=${Math.max(...timings).toFixed(1)}ms budget=${g.budgetMs}ms errors=${errors} rps=${result.requests.average}`,
  );
  if (process.env.LOAD_VERBOSE) {
    for (const [kind, xs] of Object.entries(byKind)) console.log(`        ${kind.padEnd(40)} n=${xs.length} p95=${pct(xs, 95).toFixed(1)}ms`);
  }
}
process.exit(failed ? 1 : 0);
