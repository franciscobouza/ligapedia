import type {
  ChampionsData,
  Home,
  MatchDetail,
  PhaseDetail,
  PlayerComparison,
  PlayerLeaderboard,
  PlayerList,
  PlayerMatches,
  PlayerOpponents,
  PlayerProfile,
  SearchResults,
  SeasonDetail,
  SeasonListItem,
  SiteMeta,
  TeamComparison,
  TeamLeaderboard,
  TeamList,
  TeamOpponents,
  TeamProfile,
  MatchRecords,
  TournamentDetail,
} from '@ligapedia/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { one } from '../../../test/db';
import { createApiTestEnv, type ApiTestEnv } from '../test/env';

type Env<T> = { data: T; meta: { datasetVersion: number; ignoredFilters: string[] } };

let env: ApiTestEnv;
let ids: { ort: number; aleman: number; hebraica: number; bohemios: number; apertura: number; final: number; phaseApertura: number };

beforeAll(async () => {
  env = await createApiTestEnv();
  const team = async (name: string) => one(await env.db.sql<{ id: number }[]>`SELECT id FROM core.teams WHERE name = ${name} AND category = 'M'`).id;
  ids = {
    ort: await team('UNIVERSIDAD ORT'),
    aleman: await team('ALEMAN UNIVERSITARIO'),
    hebraica: await team('HEBRAICA UNIVERSITARIO'),
    bohemios: await team('BOHEMIOS FS'),
    apertura: one(await env.db.sql<{ id: number }[]>`SELECT id FROM core.tournaments WHERE season_year = 2025 AND kind = 'apertura'`).id,
    final: one(await env.db.sql<{ id: number }[]>`SELECT id FROM core.phases WHERE season_year = 2025 AND source_serie = 'FINAL DEL APERTURA'`).id,
    phaseApertura: one(await env.db.sql<{ id: number }[]>`SELECT id FROM core.phases WHERE season_year = 2025 AND source_serie = 'APERTURA'`).id,
  };
});
afterAll(async () => env.close());

describe('7.1 health and meta', () => {
  it('reports health with dataset version and refresh age', async () => {
    const r = await env.get<{ status: string; db: string; datasetVersion: number; refreshAgeHours: number }>('/api/health');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'ok', db: 'ok', datasetVersion: 1 });
    expect(r.body.refreshAgeHours).toBeGreaterThanOrEqual(0);
    expect(r.headers['server-timing']).toMatch(/^app;dur=/);
  });

  it('serves site meta: seasons, kinds, last refresh and coverage', async () => {
    const r = await env.get<Env<SiteMeta>>('/api/v1/meta');
    expect(r.body.data.seasons[0]).toMatchObject({ year: 2026 });
    expect(r.body.data.kinds.map((k) => k.kind)).toContain('oro');
    expect(r.body.data.publishedAt).not.toBeNull();
    expect(r.body.data.coverage.goalsTotal).toBeGreaterThan(0);
  });
});

describe('7.2 response cache', () => {
  it('answers 304 for the current validator and serves cache hits', async () => {
    const first = await env.get('/api/v1/temporadas');
    expect(first.headers['cache-control']).toBe('no-cache');
    expect(first.headers['x-cache']).toBe('miss');
    const etag = String(first.headers.etag);
    const second = await env.get('/api/v1/temporadas');
    expect(second.headers['x-cache']).toBe('hit');
    const conditional = await env.app.inject({ method: 'GET', url: '/api/v1/temporadas', headers: { 'if-none-match': etag } });
    expect(conditional.statusCode).toBe(304);
    expect(conditional.body).toBe('');
  });

  it('returns new content after a dataset version bump', async () => {
    const before = await env.get<Env<unknown>>('/api/v1/meta');
    const etag = String(before.headers.etag);
    await env.db.sql`UPDATE meta.dataset SET version = version + 1 WHERE id = 1`;
    await env.ctx.dataset.refresh();
    const after = await env.app.inject({ method: 'GET', url: '/api/v1/meta', headers: { 'if-none-match': etag } });
    expect(after.statusCode).toBe(200);
    expect(JSON.parse(after.body).meta.datasetVersion).toBe(before.body.meta.datasetVersion + 1);
  });
});

describe('7.4 competitions', () => {
  it('lists seasons newest first with counts and champions', async () => {
    const r = await env.get<Env<SeasonListItem[]>>('/api/v1/temporadas');
    expect(r.body.data[0]!.year).toBe(2026);
    expect(r.body.data.at(-1)!.year).toBe(2006);
    const s2025 = r.body.data.find((s) => s.year === 2025)!;
    expect(s2025.matches).toBe(22);
    expect(s2025.champions.find((c) => c.tournament.kind === 'apertura')?.champion.team?.name).toBe('Aleman Universitario');
  });

  it('shows a season grouped by category with tournaments, phases and top scorers', async () => {
    const r = await env.get<Env<SeasonDetail>>('/api/v1/temporadas/2025');
    const m = r.body.data.categories.find((c) => c.category === 'M')!;
    const apertura = m.tournaments.find((t) => t.tournament.kind === 'apertura')!;
    expect(apertura.phases.map((p) => p.phase.name)).toEqual(['Apertura', 'Apertura - Serie 2', 'Apertura Serie 1', 'Final del Apertura']);
    expect(m.topScorers.length).toBeGreaterThan(0);
    expect(m.attributedShare).toBe(1);
    expect((await env.get('/api/v1/temporadas/1990')).status).toBe(404);
  });

  it('details a tournament with standings for league phases and matches for the final', async () => {
    const r = await env.get<Env<TournamentDetail>>(`/api/v1/torneos/${ids.apertura}`);
    const d = r.body.data;
    expect(d.champion.team?.id).toBe(ids.aleman);
    expect(d.phases[0]!.standings?.type).toBe('official');
    expect(d.phases[0]!.standings?.rows[0]).toMatchObject({ team: { name: 'Bohemios FS' }, pts: 11 });
    const final = d.phases.find((p) => p.phase.role === 'final')!;
    expect(final.matches).toHaveLength(1);
    expect(d.summary.matches).toBe(22);
  });

  it('filters a phase by round and computes standings after a round', async () => {
    const r = await env.get<Env<PhaseDetail>>(`/api/v1/fases/${ids.phaseApertura}?fecha=3`);
    expect(r.body.data.selectedRound).toBe(3);
    expect(r.body.data.matches.every((m) => m.round === 3)).toBe(true);
    expect(r.body.data.rounds).toHaveLength(5);
    const after2 = await env.get<Env<PhaseDetail>>(`/api/v1/fases/${ids.phaseApertura}?despues=2`);
    expect(after2.body.data.standings).toMatchObject({ type: 'computed', afterRound: 2 });
    expect(after2.body.data.standings!.rows.every((row) => row.pj <= 2)).toBe(true);
  });

  it('lists champions and ranks teams by titles, filterable by kind', async () => {
    const r = await env.get<Env<ChampionsData>>('/api/v1/campeones?tipo=apertura');
    expect(r.body.data.ranking[0]).toMatchObject({ team: { id: ids.aleman }, rank: 1 });
    expect(r.body.data.seasons.flatMap((s) => s.titles).every((t) => t.tournament.kind === 'apertura')).toBe(true);
  });
});

describe('7.5 match', () => {
  it('returns header, lineups, goals, referees and head-to-head for match 92923', async () => {
    const r = await env.get<Env<MatchDetail>>('/api/v1/partidos/92923');
    const d = r.body.data;
    expect(d.match).toMatchObject({ homeGoals: 4, awayGoals: 6, venue: 'G. UGAB', round: 1 });
    expect(d.lineups.home.find((l) => l.captain)?.shirt).toBe(1);
    expect(d.goals.filter((g) => g.side === 'H')).toHaveLength(4);
    expect(d.unattributed).toEqual({ home: 0, away: 0 });
    expect(d.referees).toEqual([]);
    expect(d.officialUrl).toContain('detallePartido.html?id=92923');
    expect(d.winner?.id).toBe(ids.aleman);
  });

  it('expands missing scorers of a 12–4 into unattributed counts', async () => {
    await env.db.sql`UPDATE core.matches SET home_goals = 12, home_unattributed = 8 WHERE id = 92923`;
    await env.db.sql`UPDATE meta.dataset SET version = version + 1`;
    await env.ctx.dataset.refresh();
    const r = await env.get<Env<MatchDetail>>('/api/v1/partidos/92923');
    expect(r.body.data.unattributed.home).toBe(8);
    expect(r.body.data.goals.filter((g) => g.side === 'H').length + r.body.data.unattributed.home).toBe(12);
    await env.db.sql`UPDATE core.matches SET home_goals = 4, home_unattributed = 0 WHERE id = 92923`;
  });

  it('marks the walk-over and own goals', async () => {
    const wo = await env.get<Env<MatchDetail>>('/api/v1/partidos/55623');
    expect(wo.body.data.match.walkOver).toBe(true);
    expect(wo.body.data.observations).toBe('Equipo local (CUBA) no se presenta.');
    const og = await env.get<Env<MatchDetail>>('/api/v1/partidos/19906');
    expect(og.body.data.goals.filter((g) => g.ownGoal)).toHaveLength(1);
    expect(og.body.data.match.venue).toBeNull();
  });

  it('answers 404 in Spanish for an unknown match', async () => {
    const r = await env.get<{ message: string }>('/api/v1/partidos/1');
    expect(r.status).toBe(404);
    expect(r.body.message).toBe('Partido no encontrado');
  });
});

describe('7.6 players', () => {
  let playerId: number;
  beforeAll(async () => {
    const list = await env.get<Env<PlayerList>>(`/api/v1/jugadores?equipo=${ids.ort}&temporada=2025&orden=goles`);
    playerId = list.body.data.items[0]!.player.id;
  });

  it('lists players filtered by team and season', async () => {
    const r = await env.get<Env<PlayerList>>(`/api/v1/jugadores?equipo=${ids.ort}&temporada=2025`);
    expect(r.body.data.total).toBeGreaterThan(5);
    expect(r.body.data.items.every((i) => i.teams.some((t) => t.id === ids.ort))).toBe(true);
  });

  it('builds a profile with totals, titles and coverage', async () => {
    const r = await env.get<Env<PlayerProfile>>(`/api/v1/jugadores/${playerId}-cualquier-slug`);
    const d = r.body.data;
    expect(d.totals.apps).toBeGreaterThan(0);
    expect(d.totals.goalsPerMatch).toBe(Math.round((d.totals.goals / d.totals.apps) * 100) / 100);
    expect(d.coverage.attributedShare).not.toBeNull();
    expect(d.firstMatch).not.toBeNull();
  });

  it('serves the match log filtered by opponent and the vs-teams table summing to appearances', async () => {
    const log = await env.get<Env<PlayerMatches>>(`/api/v1/jugadores/${playerId}/partidos?rival=${ids.bohemios}`);
    expect(log.body.data.rows.every((r) => r.opponent.id === ids.bohemios)).toBe(true);
    const vs = await env.get<Env<PlayerOpponents>>(`/api/v1/jugadores/${playerId}/rivales`);
    const profile = await env.get<Env<PlayerProfile>>(`/api/v1/jugadores/${playerId}`);
    expect(vs.body.data.rows.reduce((n, r) => n + r.played, 0)).toBe(profile.body.data.totals.apps);
  });

  it('never exposes membership card numbers', async () => {
    const carnes = (await env.db.sql<{ carne: string }[]>`SELECT carne FROM core.players`).map((r) => r.carne);
    const urls = [
      `/api/v1/jugadores/${playerId}`,
      `/api/v1/jugadores/${playerId}/temporadas`,
      `/api/v1/jugadores/${playerId}/partidos`,
      `/api/v1/jugadores/${playerId}/hitos`,
      `/api/v1/jugadores?temporada=2025`,
      '/api/v1/partidos/92923',
      '/api/v1/buscar?q=diego',
    ];
    for (const url of urls) {
      const body = (await env.app.inject({ url })).body;
      expect(body).not.toMatch(/carne/i);
      for (const c of carnes) expect(body.includes(`"${c}"`), `${url} leaks ${c}`).toBe(false);
    }
  });
});

describe('7.7 teams', () => {
  it('computes win and points percentages', async () => {
    const r = await env.get<Env<TeamProfile>>(`/api/v1/equipos/${ids.aleman}`);
    const t = r.body.data.totals;
    expect(t.played).toBe(t.wins + t.draws + t.losses);
    expect(t.winPct).toBe(Math.round((t.wins / t.played) * 1000) / 10);
    expect(t.pointsPct).toBe(Math.round(((t.wins * 3 + t.draws) / (t.played * 3)) * 1000) / 10);
    expect(r.body.data.titles.map((x) => x.kind)).toContain('apertura');
    expect(r.body.data.form.length).toBeGreaterThan(0);
  });

  it('opponents table sums to the team total under the same filters', async () => {
    const r = await env.get<Env<TeamOpponents>>(`/api/v1/equipos/${ids.ort}/rivales?temporada=2025`);
    const list = await env.get<Env<TeamList>>(`/api/v1/equipos?temporada=2025&rama=masculino`);
    const ort = list.body.data.items.find((i) => i.team.id === ids.ort)!;
    expect(r.body.data.totalPlayed).toBe(ort.played);
    expect(r.body.data.rows.reduce((n, x) => n + x.played, 0)).toBe(ort.played);
  });

  it('lists squads, seasons with positions and club leaders', async () => {
    const squad = await env.get<Env<{ seasonYear: number; rows: unknown[] }>>(`/api/v1/equipos/${ids.bohemios}/plantel`);
    expect(squad.body.data.seasonYear).toBe(2025);
    expect(squad.body.data.rows.length).toBeGreaterThan(5);
    const seasons = await env.get<Env<{ rows: Array<{ positions: Array<{ position: number }> }> }>>(`/api/v1/equipos/${ids.bohemios}/temporadas`);
    expect(seasons.body.data.rows[0]!.positions.some((p) => p.position === 1)).toBe(true);
    const leaders = await env.get<Env<{ goals: Array<{ value: number }> }>>(`/api/v1/equipos/${ids.bohemios}/lideres`);
    expect(leaders.body.data.goals[0]!.value).toBeGreaterThanOrEqual(leaders.body.data.goals[1]!.value);
  });
});

describe('7.8 comparisons', () => {
  it('summarizes a head-to-head and honors season filters', async () => {
    const r = await env.get<Env<TeamComparison>>(`/api/v1/comparar/equipos?a=${ids.aleman}&b=${ids.hebraica}`);
    const d = r.body.data;
    expect(d.played).toBe(d.winsA + d.winsB + d.draws);
    expect(d.matches).toHaveLength(d.played);
    const none = await env.get<Env<TeamComparison>>(`/api/v1/comparar/equipos?a=${ids.aleman}&b=${ids.hebraica}&desde=2006&hasta=2010`);
    expect(none.body.data.played).toBe(0);
  });

  it('compares two players as opponents and teammates', async () => {
    const lineup = await env.db.sql<{ player_id: number; side: string }[]>`
      SELECT player_id, side FROM core.appearances WHERE match_id = 92923 ORDER BY side, seq`;
    const h = lineup.find((l) => l.side === 'H')!.player_id;
    const a = lineup.find((l) => l.side === 'A')!.player_id;
    const r = await env.get<Env<PlayerComparison>>(`/api/v1/comparar/jugadores?a=${h}&b=${a}`);
    expect(r.body.data.opponents.played).toBeGreaterThanOrEqual(1);
    expect(r.body.data.opponents.played).toBe(r.body.data.opponents.winsA + r.body.data.opponents.draws + r.body.data.opponents.lossesA);
    const other = lineup.filter((l) => l.side === 'H')[1]!.player_id;
    const mates = await env.get<Env<PlayerComparison>>(`/api/v1/comparar/jugadores?a=${h}&b=${other}`);
    expect(mates.body.data.teammates.played).toBeGreaterThanOrEqual(1);
  });
});

describe('7.9 player leaderboards', () => {
  it('shares ranks on ties, ordered by fewer appearances', async () => {
    const r = await env.get<Env<PlayerLeaderboard>>('/api/v1/records/jugadores/goles?top=50');
    const rows = r.body.data.rows;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i]!.value === rows[i - 1]!.value) {
        expect(rows[i]!.rank).toBe(rows[i - 1]!.rank);
        expect(rows[i]!.apps).toBeGreaterThanOrEqual(rows[i - 1]!.apps);
      } else expect(rows[i]!.value).toBeLessThan(rows[i - 1]!.value);
    }
  });

  it('applies the default minimum of 10 matches to ratio rankings, and a lower one when asked', async () => {
    const def = await env.get<Env<PlayerLeaderboard>>('/api/v1/records/jugadores/tarjetas-por-partido');
    expect(def.body.data.minMatches).toBe(10);
    expect(def.body.data.rows.every((r) => r.apps >= 10)).toBe(true);
    const low = await env.get<Env<PlayerLeaderboard>>('/api/v1/records/jugadores/goles-por-partido?min=3');
    expect(low.body.data.minMatches).toBe(3);
    expect(low.body.data.rows.length).toBeGreaterThan(0);
    expect(low.body.data.rows.every((r) => r.apps >= 3)).toBe(true);
  });

  it('reports goal coverage for the filters and ignores invalid filters', async () => {
    const r = await env.get<Env<PlayerLeaderboard>>('/api/v1/records/jugadores/goles?temporada=1990&top=7');
    expect(r.status).toBe(200);
    expect(r.body.meta.ignoredFilters).toEqual(['temporada=1990', 'top=7']);
    expect(r.body.data.coverage.attributedShare).not.toBeNull();
    expect((await env.get('/api/v1/records/jugadores/inventado')).status).toBe(404);
  });
});

describe('7.10 team and match records', () => {
  it('ranks teams by titles with their tournaments', async () => {
    const r = await env.get<Env<TeamLeaderboard>>('/api/v1/records/equipos/titulos?rama=masculino');
    expect(r.body.data.rows[0]!.detail.length).toBe(r.body.data.rows[0]!.value);
  });

  it('excludes walk-overs from match records', async () => {
    const r = await env.get<Env<MatchRecords>>('/api/v1/records/partidos/goleadas?top=100');
    expect(r.body.data.rows.some((x) => x.match.id === 55623)).toBe(false);
    expect(r.body.data.rows.every((x) => !x.match.walkOver)).toBe(true);
  });

  it('lists the top scorer of every season and category with goals', async () => {
    const r = await env.get<Env<{ seasons: Array<{ seasonYear: number; scorers: unknown[] }> }>>('/api/v1/records/goleadores-por-temporada');
    expect(r.body.data.seasons.find((s) => s.seasonYear === 2025)?.scorers.length).toBeGreaterThan(0);
    const streak = await env.get<Env<TeamLeaderboard>>('/api/v1/records/equipos/racha-victorias?temporada=2025');
    expect(streak.body.data.rows[0]!.value).toBeGreaterThanOrEqual(1);
  });
});

describe('7.11 search', () => {
  it('matches accent-insensitively, tokens in any order and misspellings', async () => {
    const lourdes = await env.get<Env<SearchResults>>(`/api/v1/buscar?q=${encodeURIComponent('señora lourdes')}`);
    expect(lourdes.body.data.teams[0]?.label).toBe('Nuestra Señora de Lourdes');
    const reversed = await env.get<Env<SearchResults>>('/api/v1/buscar?q=lourdes%20senora');
    expect(reversed.body.data.teams[0]?.label).toBe('Nuestra Señora de Lourdes');
    const typo = await env.get<Env<SearchResults>>('/api/v1/buscar?q=hebraika');
    expect(typo.body.data.teams.map((t) => t.label)).toContain('Hebraica Universitario');
  });

  it('finds a player through an earlier name variant', async () => {
    const p = one(await env.db.sql<{ id: number; slug: string; display_name: string }[]>`SELECT id, slug, display_name FROM core.players LIMIT 1`);
    await env.db.sql`
      INSERT INTO stats.search_index (entity_type, entity_id, slug, label, matched_name, context, norm, popularity)
      VALUES ('player', ${p.id}, ${p.slug}, ${p.display_name}, 'Nombre Antiguo Zzyzx', '', 'nombre antiguo zzyzx', 1)`;
    await env.db.sql`UPDATE meta.dataset SET version = version + 1`;
    await env.ctx.dataset.refresh();
    const r = await env.get<Env<SearchResults>>('/api/v1/buscar?q=zzyzx');
    expect(r.body.data.players[0]).toMatchObject({ id: p.id, label: p.display_name, matchedName: 'Nombre Antiguo Zzyzx' });
  });

  it('returns at most 10 per group for a two-character query', async () => {
    const r = await env.get<Env<SearchResults>>('/api/v1/buscar?q=ma');
    expect(r.body.data.players.length).toBeLessThanOrEqual(10);
    expect((await env.get<Env<SearchResults>>('/api/v1/buscar?q=a')).body.data.players).toEqual([]);
  });
});

describe('home', () => {
  it('serves recent results, standings, scorers and highlights', async () => {
    const r = await env.get<Env<Home>>('/api/v1/inicio');
    expect(r.body.data.seasonYear).toBe(2025);
    expect(r.body.data.recentResults.length).toBeGreaterThan(0);
    expect(r.body.data.highlights.allTimeTopScorer).not.toBeNull();
    expect(r.body.data.totals.matches).toBeGreaterThan(20);
  });
});
