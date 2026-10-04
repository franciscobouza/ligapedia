import type { LeaderRow, SquadRow, TeamMatchRow, TeamOpponentRow, TeamSeasonRow } from '@ligapedia/contracts';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { lazy, Suspense } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable } from '@/components/data-table';
import { FilterBar } from '@/components/filter-bar';
import { MatchLink, PlayerLink, TeamLink, TournamentLink } from '@/components/links';
import { MatchList, ResultBadge, Score } from '@/components/match';
import { PageHeader, Section, StatCard, StatGrid } from '@/components/stats';
import { categoryLabel, formatDecimal, formatInt, formatMatchDate, formatPercent, formatShortDate } from '@/lib/format';
import { es } from '@/lib/i18n/es';
import { queries } from '@/lib/queries';
import { entityParam, idFrom, parseSearch, pick, type FilterSearch } from '@/lib/search-params';
import { useTitle } from '@/lib/use-title';

const TeamSeasonCharts = lazy(() => import('@/components/charts/team-season-chart'));

const TABS = ['resumen', 'temporadas', 'plantel', 'partidos', 'rivales', 'lideres'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = {
  resumen: 'Resumen',
  temporadas: 'Temporadas',
  plantel: 'Plantel',
  partidos: 'Partidos',
  rivales: 'Rivales',
  lideres: 'Líderes',
};
const FILTER_KEYS = ['temporada', 'desde', 'hasta', 'torneo', 'tipo', 'rival'] as const;
const tabOf = (s: FilterSearch): Tab => ((TABS as readonly string[]).includes(s.tab ?? '') ? (s.tab as Tab) : 'resumen');

export const Route = createFileRoute('/equipos/$equipo')({
  validateSearch: parseSearch,
  loaderDeps: ({ search }) => ({ tab: tabOf(search), filters: pick(search, FILTER_KEYS) }),
  loader: async ({ context: { queryClient }, params, deps, location }) => {
    const id = idFrom(params.equipo);
    const profile = await queryClient.ensureQueryData(queries.team(id));
    const canonical = entityParam(profile.data.team);
    if (params.equipo !== canonical) throw redirect({ to: '/equipos/$equipo', params: { equipo: canonical }, search: location.search as never, replace: true });
    const tab = deps.tab;
    if (tab === 'temporadas') await queryClient.ensureQueryData(queries.teamSeasons(id));
    if (tab === 'lideres') await queryClient.ensureQueryData(queries.teamLeaders(id));
    if (tab === 'rivales') await queryClient.ensureQueryData(queries.teamOpponents(id, deps.filters));
    if (tab === 'partidos') await queryClient.ensureQueryData(queries.teamMatches(id, deps.filters));
    if (tab === 'plantel') await queryClient.ensureQueryData(queries.teamSquad(id, pick(deps.filters, ['temporada'])));
  },
  component: TeamPage,
});

function TeamPage() {
  const { equipo } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const id = idFrom(equipo);
  const { data } = useSuspenseQuery(queries.team(id));
  const t = data.data;
  const tab = tabOf(search);
  useTitle(t.team.name);
  return (
    <div>
      <PageHeader
        title={t.team.name}
        subtitle={
          <>
            {categoryLabel(t.team.category)} · {t.seasons.length} temporadas ({t.seasons.at(-1)}–{t.seasons[0]})
            {t.otherNames.length > 0 && <span className="block">También publicado como: {t.otherNames.join(', ')}</span>}
          </>
        }
      >
        <Link to="/comparar/equipos" search={{ a: t.team.id }} className="text-sm underline-offset-4 hover:underline">
          Comparar con otro equipo
        </Link>
      </PageHeader>
      <Tabs value={tab} onValueChange={(v) => void navigate({ to: '.', search: { tab: v === 'resumen' ? undefined : v } })}>
        <div className="-mx-4 overflow-x-auto px-4">
          <TabsList>
            {TABS.map((x) => (
              <TabsTrigger key={x} value={x}>
                {TAB_LABEL[x]}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="resumen">{tab === 'resumen' && <Summary />}</TabsContent>
        <TabsContent value="temporadas">{tab === 'temporadas' && <Seasons id={id} />}</TabsContent>
        <TabsContent value="plantel">{tab === 'plantel' && <Squad id={id} search={search} />}</TabsContent>
        <TabsContent value="partidos">{tab === 'partidos' && <Matches id={id} search={search} />}</TabsContent>
        <TabsContent value="rivales">{tab === 'rivales' && <Opponents id={id} search={search} />}</TabsContent>
        <TabsContent value="lideres">{tab === 'lideres' && <Leaders id={id} />}</TabsContent>
      </Tabs>
    </div>
  );
}

const STREAK_LABEL = { win: 'victorias', unbeaten: 'sin perder', loss: 'derrotas', winless: 'sin ganar' } as const;

function Summary() {
  const { equipo } = Route.useParams();
  const { data } = useSuspenseQuery(queries.team(idFrom(equipo)));
  const t = data.data;
  const s = t.totals;
  return (
    <div className="mt-4">
      <StatGrid>
        <StatCard label={es.stats.apps} value={formatInt(s.played)} hint={`${s.wins} G · ${s.draws} E · ${s.losses} P`} />
        <StatCard label={es.stats.winPct} value={formatPercent(s.winPct)} />
        <StatCard label={es.stats.pointsPct} value={formatPercent(s.pointsPct)} />
        <StatCard label="Goles" value={`${formatInt(s.gf)} – ${formatInt(s.ga)}`} hint={`DG ${s.gd > 0 ? '+' : ''}${s.gd}`} />
        <StatCard label="Promedio" value={`${formatDecimal(s.gfPerMatch)} – ${formatDecimal(s.gaPerMatch)}`} hint="goles por partido" />
        <StatCard label={es.stats.cleanSheets} value={formatInt(s.cleanSheets)} hint={s.woWins || s.woLosses ? `W.O.: ${s.woWins} ganados, ${s.woLosses} perdidos` : undefined} />
      </StatGrid>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Forma y rachas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-1.5" aria-label="Últimos cinco resultados, el más reciente primero">
              {t.form.map((f) => (
                <MatchLink key={f.match.id} match={f.match} className="hover:no-underline">
                  <ResultBadge result={f.result} />
                </MatchLink>
              ))}
            </div>
            {t.currentStreak && (
              <p>
                Racha actual: <strong>{t.currentStreak.length}</strong> {STREAK_LABEL[t.currentStreak.kind]}
              </p>
            )}
            <ul className="text-muted-foreground space-y-1">
              {t.longestStreaks.map((st) => (
                <li key={st.kind}>
                  Mayor racha {STREAK_LABEL[st.kind]}: <span className="text-foreground font-medium">{st.length}</span> ({formatShortDate(st.startDate)} – {formatShortDate(st.endDate)})
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Partidos destacados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {(
              [
                ['Mayor victoria', t.biggestWin],
                ['Peor derrota', t.biggestLoss],
                ['Partido con más goles', t.highestScoring],
                ['Primer partido', t.firstMatch],
                ['Último partido', t.lastMatch],
              ] as const
            ).map(([label, m]) =>
              m ? (
                <p key={label}>
                  <span className="text-muted-foreground block text-xs">
                    {label} · {formatMatchDate(m.kickoff)}
                  </span>
                  <MatchLink match={m}>
                    {m.home.name} <Score match={m} /> {m.away.name}
                  </MatchLink>
                </p>
              ) : null,
            )}
          </CardContent>
        </Card>
      </div>
      {t.titles.length > 0 && (
        <Section title={`${es.stats.titles} (${t.titles.length})`}>
          <ul className="flex flex-wrap gap-2">
            {t.titles.map((x) => (
              <li key={x.id}>
                <Badge variant="secondary" className="py-1">
                  <TournamentLink tournament={x} withCategory={false} />
                </Badge>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Seasons({ id }: { id: number }) {
  const { data } = useSuspenseQuery(queries.teamSeasons(id));
  const columns: ColumnDef<TeamSeasonRow, unknown>[] = [
    {
      accessorKey: 'seasonYear',
      header: 'Temporada',
      cell: ({ getValue }) => (
        <Link to="/temporadas/$anio" params={{ anio: String(getValue()) }} className="font-medium underline-offset-4 hover:underline">
          {String(getValue())}
        </Link>
      ),
    },
    {
      id: 'posiciones',
      header: 'Posiciones',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="flex flex-wrap gap-1">
          {row.original.positions.map((p) => (
            <Badge key={p.phase.id} variant="outline" title={`${p.tournament.name} · ${p.phase.name}`}>
              {p.position}º/{p.teams} {p.phase.name}
            </Badge>
          ))}
        </span>
      ),
    },
    { accessorKey: 'played', header: 'PJ', meta: { align: 'right' } },
    { accessorKey: 'wins', header: 'G', meta: { align: 'right' } },
    { accessorKey: 'draws', header: 'E', meta: { align: 'right' } },
    { accessorKey: 'losses', header: 'P', meta: { align: 'right' } },
    { accessorKey: 'gf', header: 'GF', meta: { align: 'right' } },
    { accessorKey: 'ga', header: 'GC', meta: { align: 'right' } },
    {
      id: 'goleador',
      header: 'Goleador',
      enableSorting: false,
      cell: ({ row }) => (row.original.topScorer ? <span className="whitespace-nowrap"><PlayerLink player={row.original.topScorer.player} /> ({row.original.topScorer.goals})</span> : '—'),
    },
  ];
  return (
    <div className="mt-4 space-y-8">
      <DataTable data={data.data.rows} columns={columns} caption="Historial por temporada" />
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <TeamSeasonCharts rows={data.data.rows} />
      </Suspense>
    </div>
  );
}

function Squad({ id, search }: { id: number; search: FilterSearch }) {
  const navigate = useNavigate();
  const { data } = useSuspenseQuery(queries.teamSquad(id, pick(search, ['temporada'])));
  const columns: ColumnDef<SquadRow, unknown>[] = [
    { id: 'jugador', accessorFn: (r) => r.player.name, header: 'Jugador', cell: ({ row }) => <PlayerLink player={row.original.player} /> },
    { accessorKey: 'apps', header: 'PJ', meta: { align: 'right' } },
    { accessorKey: 'goals', header: 'Goles', meta: { align: 'right' } },
    { accessorKey: 'yellow', header: 'Amarillas', meta: { align: 'right' } },
    { accessorKey: 'red', header: 'Rojas', meta: { align: 'right' } },
    { accessorKey: 'captain', header: 'Capitán', meta: { align: 'right' } },
  ];
  return (
    <div className="mt-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-muted-foreground text-sm">Temporada</span>
        <Select value={String(data.data.seasonYear ?? '')} onValueChange={(v) => void navigate({ to: '.', search: (p) => ({ ...p, temporada: Number(v) }) })}>
          <SelectTrigger className="w-32" aria-label="Temporada del plantel">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {data.data.seasons.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <DataTable data={data.data.rows} columns={columns} caption="Plantel" />
    </div>
  );
}

function Matches({ id, search }: { id: number; search: FilterSearch }) {
  const { data } = useSuspenseQuery(queries.teamMatches(id, pick(search, FILTER_KEYS)));
  return (
    <div className="mt-4">
      <FilterBar search={search} show={['temporada', 'rango', 'tipo']} />
      <p className="text-muted-foreground mb-3 text-sm">{formatInt(data.data.total)} partidos</p>
      <MatchList matches={data.data.rows.map((r: TeamMatchRow) => r.match)} showTournament highlightTeamId={id} />
    </div>
  );
}

function Opponents({ id, search }: { id: number; search: FilterSearch }) {
  const { data } = useSuspenseQuery(queries.teamOpponents(id, pick(search, FILTER_KEYS)));
  const columns: ColumnDef<TeamOpponentRow, unknown>[] = [
    {
      id: 'rival',
      accessorFn: (r) => r.opponent.name,
      header: 'Rival',
      cell: ({ row }) => (
        <span className="flex items-center gap-2 whitespace-nowrap">
          <TeamLink team={row.original.opponent} />
          <Link to="/comparar/equipos" search={{ a: id, b: row.original.opponent.id }} className="text-muted-foreground text-xs underline-offset-4 hover:underline">
            historial
          </Link>
        </span>
      ),
    },
    { accessorKey: 'played', header: 'PJ', meta: { align: 'right' } },
    { accessorKey: 'wins', header: 'G', meta: { align: 'right' } },
    { accessorKey: 'draws', header: 'E', meta: { align: 'right' } },
    { accessorKey: 'losses', header: 'P', meta: { align: 'right' } },
    { accessorKey: 'gf', header: 'GF', meta: { align: 'right' } },
    { accessorKey: 'ga', header: 'GC', meta: { align: 'right' } },
    { accessorKey: 'gd', header: 'DG', meta: { align: 'right' } },
    { accessorKey: 'winPct', header: '%', meta: { align: 'right', title: '% de victorias' }, cell: ({ getValue }) => formatPercent(getValue() as number | null) },
  ];
  return (
    <div className="mt-4">
      <FilterBar search={search} show={['rango', 'tipo']} />
      <p className="text-muted-foreground mb-3 text-sm">
        {data.data.rows.length} rivales · {formatInt(data.data.totalPlayed)} partidos
      </p>
      <DataTable data={data.data.rows} columns={columns} caption="Historial contra todos los rivales" initialSort={[{ id: 'played', desc: true }]} />
    </div>
  );
}

function LeaderList({ title, rows, unit }: { title: string; rows: LeaderRow[]; unit: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">Sin registros.</p>
        ) : (
          <ol className="space-y-1.5 text-sm">
            {rows.map((r, i) => (
              <li key={r.player.id} className="flex items-center gap-2">
                <span className="text-muted-foreground w-5 text-right tabular-nums">{i + 1}</span>
                <PlayerLink player={r.player} className="min-w-0 flex-1 truncate" />
                <span className="font-semibold tabular-nums">{r.value}</span>
                <span className="text-muted-foreground w-14 text-xs">{unit}</span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function Leaders({ id }: { id: number }) {
  const { data } = useSuspenseQuery(queries.teamLeaders(id));
  const l = data.data;
  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <LeaderList title="Máximos goleadores" rows={l.goals} unit="goles" />
      <LeaderList title="Más partidos" rows={l.apps} unit="partidos" />
      <LeaderList title="Más veces capitán" rows={l.captain} unit="partidos" />
      <LeaderList title="Más rojas" rows={l.red} unit="rojas" />
      <LeaderList title="Más amarillas" rows={l.yellow} unit="amarillas" />
    </div>
  );
}
