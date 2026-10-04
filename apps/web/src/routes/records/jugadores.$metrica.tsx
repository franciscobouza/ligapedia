import type { PlayerLeaderRow, PlayerMetric } from '@ligapedia/contracts';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/data-table';
import { FilterBar } from '@/components/filter-bar';
import { PlayerLink, TeamLink } from '@/components/links';
import { CoverageNotice, IgnoredFilters, PageHeader } from '@/components/stats';
import { formatDecimal, formatInt } from '@/lib/format';
import { queries } from '@/lib/queries';
import { PLAYER_METRIC_LABELS } from '@/lib/records';
import { parseSearch, pick } from '@/lib/search-params';
import { useTitle } from '@/lib/use-title';

const KEYS = ['temporada', 'desde', 'hasta', 'rama', 'torneo', 'tipo', 'equipo', 'top', 'min'] as const;

export const Route = createFileRoute('/records/jugadores/$metrica')({
  validateSearch: parseSearch,
  loaderDeps: ({ search }) => pick(search, KEYS),
  loader: ({ context: { queryClient }, params, deps }) => {
    if (!(params.metrica in PLAYER_METRIC_LABELS)) throw notFound();
    return queryClient.ensureQueryData(queries.playerRecords(params.metrica, deps));
  },
  component: PlayerLeaderboardPage,
});

function PlayerLeaderboardPage() {
  const { metrica } = Route.useParams();
  const search = Route.useSearch();
  const { data } = useSuspenseQuery(queries.playerRecords(metrica, pick(search, KEYS)));
  const d = data.data;
  const label = PLAYER_METRIC_LABELS[metrica as PlayerMetric];
  useTitle(label.title);
  const columns: ColumnDef<PlayerLeaderRow, unknown>[] = [
    { accessorKey: 'rank', header: '#', meta: { align: 'right' } },
    { id: 'jugador', accessorFn: (r) => r.player.name, header: 'Jugador', cell: ({ row }) => <PlayerLink player={row.original.player} className="font-medium whitespace-nowrap" /> },
    {
      id: 'equipos',
      header: 'Equipos',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="flex flex-wrap gap-x-2">
          {row.original.teams.map((t) => (
            <TeamLink key={t.id} team={t} className="whitespace-nowrap" />
          ))}
        </span>
      ),
    },
    { accessorKey: 'apps', header: 'PJ', meta: { align: 'right', title: 'Partidos jugados' } },
    { accessorKey: 'value', header: label.unit.charAt(0).toUpperCase() + label.unit.slice(1), meta: { align: 'right' }, cell: ({ getValue }) => <strong>{d.isRatio ? formatDecimal(getValue() as number) : formatInt(getValue() as number)}</strong> },
  ];
  return (
    <div>
      <PageHeader title={label.title} subtitle={<Link to="/records" className="underline-offset-4 hover:underline">← Records</Link>} />
      <FilterBar search={search} show={d.isRatio ? ['temporada', 'rango', 'rama', 'tipo', 'top', 'min'] : ['temporada', 'rango', 'rama', 'tipo', 'top']} defaultMin={10} />
      <IgnoredFilters ignored={data.meta.ignoredFilters} />
      {label.coverage && <CoverageNotice coverage={d.coverage} kind={label.coverage} />}
      {d.isRatio && <p className="text-muted-foreground mb-3 text-xs">Mínimo {d.minMatches} partidos</p>}
      <DataTable data={d.rows} columns={columns} caption={label.title} stickyFirst={false} />
    </div>
  );
}
