import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import type { TournamentListItem } from '@ligapedia/contracts';
import { DataTable } from '@/components/data-table';
import { FilterBar } from '@/components/filter-bar';
import { TeamLink, TournamentLink } from '@/components/links';
import { IgnoredFilters, PageHeader } from '@/components/stats';
import { categoryLabel } from '@/lib/format';
import { es } from '@/lib/i18n/es';
import { queries } from '@/lib/queries';
import { parseSearch, pick } from '@/lib/search-params';
import { useTitle } from '@/lib/use-title';

const KEYS = ['temporada', 'desde', 'hasta', 'rama', 'tipo'] as const;

export const Route = createFileRoute('/torneos/')({
  validateSearch: parseSearch,
  loaderDeps: ({ search }) => pick(search, KEYS),
  loader: ({ context: { queryClient }, deps }) => queryClient.ensureQueryData(queries.tournaments(deps)),
  component: TournamentsPage,
});

const columns: ColumnDef<TournamentListItem, unknown>[] = [
  { id: 'torneo', accessorFn: (r) => `${r.tournament.seasonYear} ${r.tournament.name}`, header: 'Torneo', cell: ({ row }) => <TournamentLink tournament={row.original.tournament} withCategory={false} /> },
  { id: 'rama', accessorFn: (r) => categoryLabel(r.tournament.category), header: 'Rama' },
  { id: 'tipo', accessorFn: (r) => es.kinds[r.tournament.kind], header: 'Tipo' },
  { accessorKey: 'matches', header: 'Partidos', meta: { align: 'right' } },
  {
    id: 'campeon',
    accessorFn: (r) => r.champion.team?.name ?? '',
    header: 'Campeón',
    cell: ({ row }) => (row.original.champion.team ? <TeamLink team={row.original.champion.team} /> : <span className="text-muted-foreground">{es.champion.undetermined}</span>),
  },
];

function TournamentsPage() {
  const search = Route.useSearch();
  const { data } = useSuspenseQuery(queries.tournaments(pick(search, KEYS)));
  useTitle('Torneos');
  return (
    <div>
      <PageHeader title="Torneos" subtitle="Aperturas, Clausuras, Copas de Oro y Plata, finales anuales y más" />
      <FilterBar search={search} show={['temporada', 'rango', 'rama', 'tipo']} />
      <IgnoredFilters ignored={data.meta.ignoredFilters} />
      <DataTable data={data.data} columns={columns} caption="Torneos" />
    </div>
  );
}
