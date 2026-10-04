import type { OpponentRow, PlayerMatchRow, PlayerSeasonRow } from '@ligapedia/contracts';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable } from '@/components/data-table';
import { FilterBar } from '@/components/filter-bar';
import { MatchLink, TeamLink, TournamentLink } from '@/components/links';
import { ResultBadge, Score } from '@/components/match';
import { CoverageNotice, PageHeader, Section, StatCard, StatGrid } from '@/components/stats';
import { categoryLabel, formatDecimal, formatInt, formatMatchDate, formatPercent, formatShortDate } from '@/lib/format';
import { es } from '@/lib/i18n/es';
import { queries } from '@/lib/queries';
import { entityParam, idFrom, parseSearch, pick, type FilterSearch } from '@/lib/search-params';
import { useTitle } from '@/lib/use-title';

const TABS = ['resumen', 'temporadas', 'partidos', 'rivales', 'hitos'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { resumen: 'Resumen', temporadas: 'Temporadas', partidos: 'Partidos', rivales: 'Rivales', hitos: 'Hitos' };
const FILTER_KEYS = ['temporada', 'desde', 'hasta', 'torneo', 'tipo', 'equipo', 'rival'] as const;
const tabOf = (s: FilterSearch): Tab => ((TABS as readonly string[]).includes(s.tab ?? '') ? (s.tab as Tab) : 'resumen');

export const Route = createFileRoute('/jugadores/$jugador')({
  validateSearch: parseSearch,
  loaderDeps: ({ search }) => ({ tab: tabOf(search), filters: pick(search, FILTER_KEYS) }),
  loader: async ({ context: { queryClient }, params, deps, location }) => {
    const id = idFrom(params.jugador);
    const profile = await queryClient.ensureQueryData(queries.player(id));
    const canonical = entityParam(profile.data.player);
    if (params.jugador !== canonical) throw redirect({ to: '/jugadores/$jugador', params: { jugador: canonical }, search: location.search as never, replace: true });
    if (deps.tab === 'temporadas') await queryClient.ensureQueryData(queries.playerSeasons(id));
    if (deps.tab === 'partidos') await queryClient.ensureQueryData(queries.playerMatches(id, deps.filters));
    if (deps.tab === 'rivales') await queryClient.ensureQueryData(queries.playerOpponents(id, deps.filters));
    if (deps.tab === 'hitos') await queryClient.ensureQueryData(queries.playerMilestones(id));
  },
  component: PlayerPage,
});

function PlayerPage() {
  const { jugador } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const id = idFrom(jugador);
  const { data } = useSuspenseQuery(queries.player(id));
  const p = data.data;
  const tab = tabOf(search);
  useTitle(p.player.name);
  return (
    <div>
      <PageHeader
        title={p.player.name}
        subtitle={
          <>
            {p.categories.map(categoryLabel).join(' / ')} · {p.teams.map((t) => t.team.name).join(', ')}
            {p.otherNames.length > 0 && <span className="block">También registrado como: {p.otherNames.join(', ')}</span>}
          </>
        }
      >
        <Link to="/comparar/jugadores" search={{ a: p.player.id }} className="text-sm underline-offset-4 hover:underline">
          Comparar con otro jugador
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
        <TabsContent value="partidos">{tab === 'partidos' && <Matches id={id} search={search} />}</TabsContent>
        <TabsContent value="rivales">{tab === 'rivales' && <Opponents id={id} search={search} />}</TabsContent>
        <TabsContent value="hitos">{tab === 'hitos' && <Milestones id={id} />}</TabsContent>
      </Tabs>
    </div>
  );
}

function Summary() {
  const { jugador } = Route.useParams();
  const { data } = useSuspenseQuery(queries.player(idFrom(jugador)));
  const p = data.data;
  const t = p.totals;
  return (
    <div className="mt-4">
      <CoverageNotice coverage={p.coverage} kind="goals" />
      <StatGrid>
        <StatCard label={es.stats.apps} value={formatInt(t.apps)} hint={`${t.wins} G · ${t.draws} E · ${t.losses} P`} />
        <StatCard label={es.stats.goals} value={formatInt(t.goals)} hint={`${formatDecimal(t.goalsPerMatch)} por partido`} />
        <StatCard label={es.stats.winPct} value={formatPercent(t.winPct)} />
        <StatCard label="Tarjetas" value={`${t.yellow} / ${t.red}`} hint={`amarillas / rojas · ${formatDecimal(t.cardsPerMatch)} por partido`} />
        <StatCard label={es.stats.captain} value={formatInt(t.captain)} hint="partidos" />
        <StatCard label={es.stats.titles} value={formatInt(p.titles.length)} hint={t.ownGoals ? `${t.ownGoals} goles en contra` : undefined} />
      </StatGrid>
      <p className="text-muted-foreground mt-3 text-xs">
        {p.coverage.yellowSeasons.length
          ? `Amarillas registradas en la fuente sólo en: ${p.coverage.yellowSeasons.join(', ')}.`
          : 'La fuente no registra amarillas en las temporadas de este jugador.'}
      </p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Equipos</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {p.teams.map((x) => (
                <li key={x.team.id} className="flex justify-between gap-2">
                  <TeamLink team={x.team} />
                  <span className="text-muted-foreground text-right">
                    {x.seasons.length > 1 ? `${x.seasons[0]}–${x.seasons.at(-1)}` : x.seasons[0]} · {x.apps} PJ
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Primer y último partido</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {(
              [
                ['Primer partido', p.firstMatch],
                ['Último partido', p.lastMatch],
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
      {p.titles.length > 0 && (
        <Section title={`${es.stats.titles} (${p.titles.length})`}>
          <ul className="flex flex-wrap gap-2">
            {p.titles.map((x) => (
              <li key={x.tournament.id}>
                <Badge variant="secondary" className="py-1">
                  <TournamentLink tournament={x.tournament} withCategory={false} /> · {x.team.name}
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
  const { data } = useSuspenseQuery(queries.playerSeasons(id));
  const t = data.data.totals;
  const columns: ColumnDef<PlayerSeasonRow, unknown>[] = [
    { accessorKey: 'seasonYear', header: 'Temporada', cell: ({ getValue }) => <span className="font-medium">{String(getValue())}</span> },
    { id: 'equipo', accessorFn: (r) => r.team.name, header: 'Equipo', cell: ({ row }) => <TeamLink team={row.original.team} className="whitespace-nowrap" /> },
    { id: 'rama', accessorFn: (r) => categoryLabel(r.category), header: 'Rama' },
    { accessorKey: 'apps', header: 'PJ', meta: { align: 'right' } },
    { accessorKey: 'goals', header: 'Goles', meta: { align: 'right' } },
    { accessorKey: 'yellow', header: 'Am.', meta: { align: 'right', title: 'Amarillas' } },
    { accessorKey: 'red', header: 'Rojas', meta: { align: 'right' } },
    { accessorKey: 'captain', header: 'Cap.', meta: { align: 'right', title: 'Partidos como capitán' } },
    { id: 'wdl', header: 'G-E-P', enableSorting: false, meta: { align: 'right' }, cell: ({ row }) => `${row.original.wins}-${row.original.draws}-${row.original.losses}` },
  ];
  return (
    <div className="mt-4">
      <DataTable data={data.data.rows} columns={columns} caption="Temporadas por equipo" />
      <p className="mt-3 rounded-md border px-3 py-2 text-sm tabular-nums">
        <strong>Total carrera:</strong> {t.apps} PJ · {t.goals} goles · {t.yellow} amarillas · {t.red} rojas · {t.captain} como capitán · {t.wins}-{t.draws}-{t.losses}
      </p>
    </div>
  );
}

function Matches({ id, search }: { id: number; search: FilterSearch }) {
  const { data } = useSuspenseQuery(queries.playerMatches(id, pick(search, FILTER_KEYS)));
  const columns: ColumnDef<PlayerMatchRow, unknown>[] = [
    { id: 'fecha', accessorFn: (r) => r.match.kickoff ?? '', header: 'Fecha', cell: ({ row }) => <span className="whitespace-nowrap">{formatShortDate(row.original.match.kickoff)}</span> },
    { id: 'equipo', accessorFn: (r) => r.team.name, header: 'Equipo', cell: ({ row }) => <TeamLink team={row.original.team} className="whitespace-nowrap" /> },
    { id: 'rival', accessorFn: (r) => r.opponent.name, header: 'Rival', cell: ({ row }) => <TeamLink team={row.original.opponent} className="whitespace-nowrap" /> },
    {
      id: 'resultado',
      header: 'Resultado',
      enableSorting: false,
      cell: ({ row }) => (
        <MatchLink match={row.original.match} className="inline-flex items-center gap-2 whitespace-nowrap">
          <ResultBadge result={row.original.result} /> <Score match={row.original.match} />
        </MatchLink>
      ),
    },
    { accessorKey: 'goals', header: 'Goles', meta: { align: 'right' } },
    { id: 'tarjetas', accessorFn: (r) => r.red * 10 + r.yellow, header: 'Tarjetas', meta: { align: 'center' }, cell: ({ row }) => `${row.original.yellow ? '🟨'.repeat(row.original.yellow) : ''}${row.original.red ? '🟥'.repeat(row.original.red) : ''}` },
    { id: 'torneo', accessorFn: (r) => r.match.tournament.name, header: 'Torneo', cell: ({ row }) => <TournamentLink tournament={row.original.match.tournament} withCategory={false} className="whitespace-nowrap" /> },
  ];
  return (
    <div className="mt-4">
      <FilterBar search={search} show={['temporada', 'rango', 'tipo']} />
      {search.rival && (
        <p className="mb-3 text-sm">
          Filtrado por rival ·{' '}
          <Link to="." search={(prev: FilterSearch) => ({ ...prev, rival: undefined })} className="underline-offset-4 hover:underline">
            quitar
          </Link>
        </p>
      )}
      <p className="text-muted-foreground mb-3 text-sm">{formatInt(data.data.total)} partidos</p>
      <DataTable data={data.data.rows} columns={columns} caption="Partidos del jugador" />
    </div>
  );
}

function Opponents({ id, search }: { id: number; search: FilterSearch }) {
  const { data } = useSuspenseQuery(queries.playerOpponents(id, pick(search, FILTER_KEYS)));
  const columns: ColumnDef<OpponentRow, unknown>[] = [
    {
      id: 'rival',
      accessorFn: (r) => r.opponent.name,
      header: 'Rival',
      cell: ({ row }) => (
        <span className="flex items-center gap-2 whitespace-nowrap">
          <TeamLink team={row.original.opponent} />
          <Link to="." search={{ tab: 'partidos', rival: row.original.opponent.id }} className="text-muted-foreground text-xs underline-offset-4 hover:underline">
            partidos
          </Link>
        </span>
      ),
    },
    { accessorKey: 'played', header: 'PJ', meta: { align: 'right' } },
    { accessorKey: 'wins', header: 'G', meta: { align: 'right' } },
    { accessorKey: 'draws', header: 'E', meta: { align: 'right' } },
    { accessorKey: 'losses', header: 'P', meta: { align: 'right' } },
    { accessorKey: 'goals', header: 'Goles', meta: { align: 'right' } },
    { accessorKey: 'yellow', header: 'Am.', meta: { align: 'right', title: 'Amarillas' } },
    { accessorKey: 'red', header: 'Rojas', meta: { align: 'right' } },
  ];
  return (
    <div className="mt-4">
      <FilterBar search={search} show={['rango', 'tipo']} />
      <DataTable data={data.data.rows} columns={columns} caption="Historial contra cada rival" initialSort={[{ id: 'played', desc: true }]} />
    </div>
  );
}

const MILESTONE_LABEL = {
  first_match: () => 'Debut',
  first_goal: () => 'Primer gol',
  apps: (v: number) => `Partido número ${v}`,
  goals: (v: number) => `Gol número ${v}`,
  best_match: (v: number) => `Mejor partido: ${v} ${v === 1 ? 'gol' : 'goles'}`,
} as const;

function Milestones({ id }: { id: number }) {
  const { data } = useSuspenseQuery(queries.playerMilestones(id));
  return (
    <div className="mt-4">
      <p className="text-muted-foreground mb-4 text-sm">{data.data.hatTricks} partidos con 3 o más goles.</p>
      <ol className="relative space-y-4 border-l pl-6">
        {data.data.milestones.map((m, i) => (
          <li key={i}>
            <span className="bg-primary absolute -left-1.5 mt-1.5 size-3 rounded-full" aria-hidden />
            <p className="font-medium">{MILESTONE_LABEL[m.kind](m.value)}</p>
            <p className="text-muted-foreground text-sm">
              {formatMatchDate(m.match.kickoff)} · {m.team.name} vs{' '}
              <MatchLink match={m.match}>
                {m.opponent.name} (<Score match={m.match} />)
              </MatchLink>
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
