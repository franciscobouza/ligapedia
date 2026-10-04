import {
  createTeamResolver,
  DETAIL_ACTIONS,
  groupPhases,
  isSourceAction,
  montevideoToUtc,
  normalizeMatch,
  normalizeName,
  parseSeasonText,
  parseSourceResponse,
  phaseDisplayName,
  playerDisplayName,
  req,
  requestKey,
  seasonYearFromCode,
  slugify,
  SPORT_FUTSAL,
  TEAM_ACRONYMS,
  teamDisplayName,
  type Category,
  type MatchListRow,
  type NormalizedMatch,
  type Overrides,
  type PhaseRole,
  type RowOf,
  type SourceAction,
  type SourceRequest,
  type TournamentKind,
} from '@ligapedia/domain';

/** Archived responses indexed by request key. */
export type ArchiveIndex = Map<string, { status: number; body: string }>;

// ---------- Draft rows (natural keys; registry IDs are assigned later) ----------

export interface DraftSeason {
  code: number;
  year: number;
  name: string | null;
}

export interface DraftTournament {
  key: string;
  slug: string;
  seasonCode: number;
  seasonYear: number;
  category: Category;
  kind: TournamentKind;
  name: string;
  sortOrder: number;
  startDate: string | null;
  endDate: string | null;
}

export interface DraftPhase {
  key: string;
  slug: string;
  tournamentKey: string;
  seasonCode: number;
  seasonYear: number;
  category: Category;
  torneo: string;
  serie: string;
  name: string;
  role: PhaseRole;
  sortOrder: number;
  startDate: string | null;
  endDate: string | null;
  hasOfficialStandings: boolean;
  /** Rounds the source lists for this series, and matches found in them (sanity gate input). */
  listedRounds: number;
  matchCount: number;
}

export interface DraftTeam {
  key: string;
  slug: string;
  category: Category;
  name: string;
  displayName: string;
  names: string[];
}

export interface DraftPlayer {
  carne: string;
  slug: string;
  name: string;
  displayName: string;
  names: Array<{ name: string; displayName: string; firstYear: number; lastYear: number }>;
}

export interface DraftMatch extends NormalizedMatch {
  seasonCode: number;
  seasonYear: number;
  category: Category;
  tournamentKey: string;
  phaseKey: string;
  round: number;
  kickoff: Date | null;
  kickoffOrder: number;
  homeTeamKey: string;
  awayTeamKey: string;
}

export interface DraftStanding {
  phaseKey: string;
  position: number;
  teamKey: string;
  pj: number;
  pg: number;
  pe: number;
  pp: number;
  gf: number;
  gc: number;
  pts: number;
}

export interface CoreReport {
  unrecognizedPhases: Array<{ season: number; torneo: string; serie: string }>;
  unresolvedCards: Array<{ matchId: number; name: string; color: 'Y' | 'R' }>;
  inconsistentMatches: number[];
  doubtfulDates: number[];
  missingDetails: number[];
  teamNames: string[];
  /** Season codes whose published year collided with another season (code-derived year used). */
  seasonYearConflicts: number[];
}

export interface CoreDraft {
  sport: string;
  seasons: DraftSeason[];
  tournaments: DraftTournament[];
  phases: DraftPhase[];
  teams: DraftTeam[];
  players: DraftPlayer[];
  venues: string[];
  matches: DraftMatch[];
  standings: DraftStanding[];
  report: CoreReport;
}

// ---------- Helpers ----------

function rowsOf<A extends SourceAction>(archive: ArchiveIndex, r: SourceRequest<A>): RowOf<A>[] | undefined {
  const hit = archive.get(requestKey(r));
  if (!hit || !isSourceAction(r.action)) return undefined;
  const parsed = parseSourceResponse(r.action, hit.status, hit.body);
  return parsed.ok ? (parsed.rows as RowOf<A>[]) : undefined;
}

export function categoryOf(categoria: string | null | undefined, torneo: string): Category {
  const n = normalizeName(categoria ?? '');
  if (n.includes('FEMENINO')) return 'F';
  if (n.includes('MASCULINO')) return 'M';
  return normalizeName(torneo).includes('FEMENINO') ? 'F' : 'M';
}

function mode<T>(values: T[]): T | undefined {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | undefined;
  let bestN = 0;
  for (const [v, n] of counts) if (n > bestN) [best, bestN] = [v, n];
  return best;
}

const categoryLabel = (c: Category) => (c === 'F' ? 'femenino' : 'masculino');

interface ListedMatch {
  seasonCode: number;
  torneo: string;
  serie: string;
  fecha: string;
  row: MatchListRow;
}

// ---------- Build ----------

/** Turn the raw archive plus curated overrides into a normalized draft dataset (design D4/D6). */
export function buildCore(archive: ArchiveIndex, overrides: Overrides, sport = SPORT_FUTSAL): CoreDraft {
  const report: CoreReport = {
    unrecognizedPhases: [],
    unresolvedCards: [],
    inconsistentMatches: [],
    doubtfulDates: [],
    missingDetails: [],
    teamNames: [],
    seasonYearConflicts: [],
  };
  const resolver = createTeamResolver(overrides.teamAliases);
  const acronyms = new Set([...TEAM_ACRONYMS, ...(overrides.displayNames.acronyms ?? []).map(normalizeName)]);
  const teamDisplayOverride = new Map(
    Object.entries(overrides.displayNames.teams ?? {}).map(([k, v]) => [normalizeName(k), v]),
  );

  // 1. Seasons that have FUTSAL tournaments, and their listing trees.
  const seasonCodes = (rowsOf(archive, req.seasons()) ?? []).map((s) => Number(s.codigo)).filter(Number.isFinite);
  const listed: ListedMatch[] = [];
  const seriesBySeason = new Map<number, Array<{ torneo: string; serie: string }>>();
  for (const code of seasonCodes.sort((a, b) => a - b)) {
    const t = String(code);
    const torneos = rowsOf(archive, req.tournaments(t, sport));
    if (!torneos?.length) continue;
    const series: Array<{ torneo: string; serie: string }> = [];
    for (const { nombre: torneo } of torneos) {
      for (const { nombre: serie } of rowsOf(archive, req.series(t, torneo, sport)) ?? []) {
        series.push({ torneo, serie });
        for (const { fecha } of rowsOf(archive, req.rounds(t, torneo, serie, sport)) ?? []) {
          for (const row of rowsOf(archive, req.matches(t, torneo, serie, fecha, sport)) ?? []) {
            listed.push({ seasonCode: code, torneo, serie, fecha, row });
          }
        }
      }
    }
    seriesBySeason.set(code, series);
  }

  // 2. Normalize each match (first listing wins on duplicate IDs).
  const seenIds = new Set<string>();
  interface Staged {
    listing: ListedMatch;
    m: NormalizedMatch;
    category: Category;
    seasonText: string | null;
  }
  const staged: Staged[] = [];
  for (const l of listed) {
    if (seenIds.has(l.row.ID)) continue;
    seenIds.add(l.row.ID);
    const id = l.row.ID;
    const d = <A extends (typeof DETAIL_ACTIONS)[number]>(action: A) => rowsOf(archive, req.detail(action, id));
    const detail = d('cargarDetallesPartido')?.[0] ?? null;
    if (!detail) report.missingDetails.push(Number(id));
    const seasonGuess = parseSeasonText(detail?.temporada, l.seasonCode).year;
    const m = normalizeMatch({
      listing: l.row,
      detail,
      lineups: { H: d('Titulares Locatario') ?? [], A: d('Titulares Visitante') ?? [] },
      goals: { H: d('GolesLocatario') ?? [], A: d('GolesVisitante') ?? [] },
      yellows: { H: d('Amonestados Locatario') ?? [], A: d('Amonestados Visitante') ?? [] },
      reds: { H: d('Expulsados Locatario') ?? [], A: d('Expulsados Visitante') ?? [] },
      substitutions: { H: d('CambiosLocatario') ?? [], A: d('CambiosVisitante') ?? [] },
      referees: d('jueces') ?? [],
      seasonYear: seasonGuess,
    });
    staged.push({ listing: l, m, category: categoryOf(detail?.categoria, l.torneo), seasonText: detail?.temporada ?? null });
  }

  // 3. Seasons: year from the details text (mode), dedication (mode of non-null names).
  const seasons: DraftSeason[] = [];
  for (const code of seriesBySeason.keys()) {
    const infos = staged.filter((s) => s.listing.seasonCode === code).map((s) => parseSeasonText(s.seasonText, code));
    seasons.push({
      code,
      year: mode(infos.map((i) => i.year)) ?? seasonYearFromCode(code),
      name: mode(infos.map((i) => i.name).filter((n): n is string => n !== null)) ?? null,
    });
  }
  // A published year that collides with another season's is not trusted: use the code-derived year.
  const byYear = new Map<number, DraftSeason[]>();
  for (const s of seasons) byYear.set(s.year, [...(byYear.get(s.year) ?? []), s]);
  for (const group of byYear.values()) {
    if (group.length < 2) continue;
    for (const s of group) {
      if (s.year !== seasonYearFromCode(s.code)) {
        report.seasonYearConflicts.push(s.code);
        s.year = seasonYearFromCode(s.code);
      }
    }
  }
  const yearOf = new Map(seasons.map((s) => [s.code, s.year]));
  for (const s of staged) {
    const year = yearOf.get(s.listing.seasonCode)!;
    const kickoffYear = s.m.kickoffLocal ? Number(s.m.kickoffLocal.slice(0, 4)) : null;
    s.m.doubtfulDate = kickoffYear !== null && kickoffYear !== year;
  }

  // 4. Phases → tournaments per season and category.
  const phaseId = (code: number, torneo: string, serie: string) => `${code}|${normalizeName(torneo)}|${normalizeName(serie)}`;
  const matchesByPhase = new Map<string, Staged[]>();
  for (const s of staged) {
    const k = phaseId(s.listing.seasonCode, s.listing.torneo, s.listing.serie);
    matchesByPhase.set(k, [...(matchesByPhase.get(k) ?? []), s]);
  }
  const tournaments: DraftTournament[] = [];
  const phases: DraftPhase[] = [];
  const phaseKeyOf = new Map<string, { phaseKey: string; tournamentKey: string; category: Category }>();
  for (const [code, series] of seriesBySeason) {
    const year = yearOf.get(code)!;
    const byCategory = new Map<Category, Array<{ torneo: string; serie: string; ms: Staged[] }>>();
    for (const { torneo, serie } of series) {
      const ms = matchesByPhase.get(phaseId(code, torneo, serie)) ?? [];
      const category = mode(ms.map((x) => x.category)) ?? categoryOf(null, torneo);
      byCategory.set(category, [...(byCategory.get(category) ?? []), { torneo, serie, ms }]);
    }
    let tournamentOrder = 0;
    for (const category of (['M', 'F'] as const).filter((c) => byCategory.has(c))) {
      const inputs = byCategory.get(category)!.map(({ torneo, serie, ms }) => {
        const teams = new Set<string>();
        const pairs = new Set<string>();
        const dates: string[] = [];
        for (const x of ms) {
          const h = resolver.key(x.listing.row.Locatario, category);
          const a = resolver.key(x.listing.row.Visitante, category);
          teams.add(h).add(a);
          pairs.add([h, a].sort().join('|'));
          if (x.m.kickoffLocal) dates.push(x.m.kickoffLocal.slice(0, 10));
        }
        dates.sort();
        return {
          torneo,
          serie,
          shape: { teams: teams.size, pairs: pairs.size },
          startDate: dates[0] ?? null,
          endDate: dates.at(-1) ?? null,
        };
      });
      for (const g of groupPhases(sport, code, category, inputs, overrides.phases)) {
        tournaments.push({
          key: g.key,
          slug: slugify(`${g.name} ${year} ${categoryLabel(category)}`),
          seasonCode: code,
          seasonYear: year,
          category,
          kind: g.kind,
          name: g.name,
          sortOrder: tournamentOrder++,
          startDate: g.startDate,
          endDate: g.endDate,
        });
        g.phases.forEach((p, i) => {
          if (p.unrecognized) report.unrecognizedPhases.push({ season: code, torneo: p.torneo, serie: p.serie });
          const standings = rowsOf(archive, req.standings(String(code), p.torneo, p.serie, sport)) ?? [];
          const listedRounds = rowsOf(archive, req.rounds(String(code), p.torneo, p.serie, sport))?.length ?? 0;
          phases.push({
            key: p.key,
            slug: slugify(phaseDisplayName(p.serie)),
            tournamentKey: g.key,
            seasonCode: code,
            seasonYear: year,
            category,
            torneo: p.torneo,
            serie: p.serie,
            name: phaseDisplayName(p.serie),
            role: p.role,
            sortOrder: i,
            startDate: p.startDate,
            endDate: p.endDate,
            hasOfficialStandings: standings.length > 0,
            listedRounds,
            matchCount: matchesByPhase.get(phaseId(code, p.torneo, p.serie))?.length ?? 0,
          });
          phaseKeyOf.set(phaseId(code, p.torneo, p.serie), { phaseKey: p.key, tournamentKey: g.key, category });
        });
      }
    }
  }

  // 5. Matches with keys and global chronological order.
  const matches: DraftMatch[] = staged.map((s) => {
    const ph = phaseKeyOf.get(phaseId(s.listing.seasonCode, s.listing.torneo, s.listing.serie))!;
    return {
      ...s.m,
      seasonCode: s.listing.seasonCode,
      seasonYear: yearOf.get(s.listing.seasonCode)!,
      category: ph.category,
      tournamentKey: ph.tournamentKey,
      phaseKey: ph.phaseKey,
      round: Number(s.listing.fecha) || 0,
      kickoff: montevideoToUtc(s.m.kickoffLocal),
      kickoffOrder: 0,
      homeTeamKey: resolver.key(s.listing.row.Locatario, ph.category),
      awayTeamKey: resolver.key(s.listing.row.Visitante, ph.category),
    };
  });
  matches
    .sort(
      (a, b) =>
        a.seasonYear - b.seasonYear ||
        (a.kickoffLocal ?? '9999').localeCompare(b.kickoffLocal ?? '9999') ||
        a.id - b.id,
    )
    .forEach((m, i) => (m.kickoffOrder = i + 1));

  // 6. Teams: spellings seen in matches and standings; display name from the latest spelling.
  const spellings = new Map<string, { category: Category; names: Map<string, number> }>();
  const addSpelling = (published: string, category: Category, order: number) => {
    const key = resolver.key(published, category);
    const entry = spellings.get(key) ?? { category, names: new Map() };
    const clean = published.replace(/\s+/g, ' ').trim();
    entry.names.set(clean, Math.max(entry.names.get(clean) ?? 0, order));
    spellings.set(key, entry);
  };
  const stagedById = new Map(staged.map((s) => [s.m.id, s]));
  for (const m of matches) {
    const src = stagedById.get(m.id)!;
    addSpelling(src.listing.row.Locatario, m.category, m.kickoffOrder);
    addSpelling(src.listing.row.Visitante, m.category, m.kickoffOrder);
  }
  const standings: DraftStanding[] = [];
  for (const p of phases) {
    const rows = rowsOf(archive, req.standings(String(p.seasonCode), p.torneo, p.serie, sport)) ?? [];
    rows.forEach((r, i) => {
      addSpelling(r.Institucion, p.category, 0);
      standings.push({
        phaseKey: p.key,
        position: i + 1,
        teamKey: resolver.key(r.Institucion, p.category),
        pj: Number(r.PJ) || 0,
        pg: Number(r.PG) || 0,
        pe: Number(r.PE) || 0,
        pp: Number(r.PP) || 0,
        gf: Number(r.GF) || 0,
        gc: Number(r.GC) || 0,
        pts: Number(r.Puntos) || 0,
      });
    });
  }
  const aliasCanonical = new Map(overrides.teamAliases.map((a) => [normalizeName(a.canonical), a.canonical.trim()]));
  const teams: DraftTeam[] = [...spellings.entries()].map(([key, { category, names }]) => {
    const canonicalNorm = key.slice(2);
    const latest = [...names.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    const name = aliasCanonical.get(canonicalNorm) ?? latest;
    const override = [name, ...names.keys()].map((n) => teamDisplayOverride.get(normalizeName(n))).find(Boolean);
    const displayName = override ?? teamDisplayName(name, acronyms);
    report.teamNames.push(name);
    return { key, slug: slugify(displayName), category, name, displayName, names: [...names.keys()].sort() };
  });

  // 7. Players: latest published name per card, with all name variants and their years.
  const playerNames = new Map<string, Map<string, { first: number; last: number; order: number }>>();
  for (const m of matches) {
    for (const a of m.appearances) {
      const byName = playerNames.get(a.carne) ?? new Map();
      const v = byName.get(a.name) ?? { first: m.seasonYear, last: m.seasonYear, order: 0 };
      v.first = Math.min(v.first, m.seasonYear);
      v.last = Math.max(v.last, m.seasonYear);
      v.order = Math.max(v.order, m.kickoffOrder);
      byName.set(a.name, v);
      playerNames.set(a.carne, byName);
    }
  }
  const playerOverride = overrides.displayNames.players ?? {};
  const players: DraftPlayer[] = [...playerNames.entries()].map(([carne, byName]) => {
    const variants = [...byName.entries()].sort((a, b) => b[1].order - a[1].order);
    const name = variants[0]![0];
    const displayName = playerOverride[carne] ?? playerDisplayName(name);
    return {
      carne,
      slug: slugify(displayName),
      name,
      displayName,
      names: variants.map(([n, v]) => ({ name: n, displayName: playerDisplayName(n), firstYear: v.first, lastYear: v.last })),
    };
  });
  // Scorers always appear in a lineup in observed data; keep any that do not, as nameless players.
  const known = new Set(playerNames.keys());
  for (const m of matches)
    for (const g of m.goals)
      if (!known.has(g.carne)) {
        known.add(g.carne);
        players.push({ carne: g.carne, slug: 'jugador', name: `Jugador ${g.carne}`, displayName: 'Jugador sin nombre', names: [] });
      }

  // 8. Report.
  for (const m of matches) {
    if (m.inconsistent) report.inconsistentMatches.push(m.id);
    if (m.doubtfulDate) report.doubtfulDates.push(m.id);
    for (const c of m.cards) if (!c.carne) report.unresolvedCards.push({ matchId: m.id, name: c.rawName, color: c.color });
  }

  const venues = [...new Set(matches.map((m) => m.venue).filter((v): v is string => v !== null))].sort();
  return {
    sport,
    seasons: seasons.sort((a, b) => a.code - b.code),
    tournaments,
    phases,
    teams,
    players,
    venues,
    matches,
    standings,
    report,
  };
}
