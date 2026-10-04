import type { TeamLeaderRow, TeamMetric } from '@ligapedia/contracts';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/data-table';
import { FilterBar } from '@/components/filter-bar';
import { TeamLink, TournamentLink } from '@/components/links';
import { IgnoredFilters, PageHeader } from '@/components/stats';
import { formatDecimal, formatInt, formatPercent } from '@/lib/format';
import { queries } from '@/lib/queries';
import { TEAM_METRIC_LABELS } from '@/lib/records';
import { parseSearch, pick } from '@/lib/search-params';
import { useTitle } from '@/lib/use-title';

const KEYS = ['temporada', 'desde', 'hasta', 'rama', 'torneo', 'tipo', 'top', 'min'] as const;

export const Route = createFileRoute('/records/equipos/$metrica')({
  validateSearch: parseSearch,
  loaderDeps: ({ search }) => pick(search, KEYS),
  loader: ({ context: { queryClient }, params, deps }) => {
    if (!(params.metrica in TEAM_METRIC_LABELS)) throw notFound();
    return queryClient.ensureQueryData(queries.teamRecords(params.metrica, deps));
  },
  component: TeamLeaderboardPage,
});

function TeamLeaderboardPage() {
  const { metrica } = Route.useParams();
  const search = Route.useSearch();
  const { data } = useSuspenseQuery(queries.teamRecords(metrica, pick(search, KEYS)));
  const d = data.data;
  const label = TEAM_METRIC_LABELS[metrica as TeamMetric];
  useTitle(label.title);
  const fmt = (v: number) => (metrica.startsWith('porcentaje') ? formatPercent(v) : d.isRatio ? formatDecimal(v) : formatInt(v));
  const columns: ColumnDef<TeamLeaderRow, unknown>[] = [
    { accessorKey: 'rank', header: '#', meta: { align: 'right' } },
    { id: 'equipo', accessorFn: (r) => r.team.name, header: 'Equipo', cell: ({ row }) => <TeamLink team={row.original.team} className="font-medium whitespace-nowrap" /> },
    { accessorKey: 'played', header: 'PJ', meta: { align: 'right', title: 'Partidos jugados' } },
    { accessorKey: 'value', header: label.title, meta: { align: 'right' }, cell: ({ getValue }) => <strong>{fmt(getValue() as number)}</strong> },
  ];
  if (metrica === 'titulos') {
    columns.push({
      id: 'detalle',
      header: 'Títulos',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="flex flex-wrap gap-x-2 text-xs">
          {row.original.detail.map((t) => (
            <TournamentLink key={t.id} tournament={t} withCategory={false} className="whitespace-nowrap" />
          ))}
        </span>
      ),
    });
  }
  return (
    <div>
      <PageHeader title={label.title} subtitle={<Link to="/records" className="underline-offset-4 hover:underline">← Records</Link>} />
      <FilterBar search={search} show={d.isRatio ? ['temporada', 'rango', 'rama', 'tipo', 'top', 'min'] : ['temporada', 'rango', 'rama', 'tipo', 'top']} defaultMin={20} />
      <IgnoredFilters ignored={data.meta.ignoredFilters} />
      {d.isRatio && <p className="text-muted-foreground mb-3 text-xs">Mínimo {d.minMatches} partidos</p>}
      <DataTable data={d.rows} columns={columns} caption={label.title} stickyFirst={false} />
    </div>
  );
}
