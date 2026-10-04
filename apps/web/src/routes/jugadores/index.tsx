import type { PlayerListItem } from '@ligapedia/contracts';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DataTable } from '@/components/data-table';
import { FilterBar } from '@/components/filter-bar';
import { PlayerLink, TeamLink } from '@/components/links';
import { Pagination } from '@/components/pagination';
import { IgnoredFilters, PageHeader } from '@/components/stats';
import { queries } from '@/lib/queries';
import { parseSearch, pick } from '@/lib/search-params';
import { useTitle } from '@/lib/use-title';

const KEYS = ['temporada', 'desde', 'hasta', 'rama', 'equipo', 'torneo', 'orden', 'pagina'] as const;
const ORDERS = { partidos: 'Más partidos', goles: 'Más goles', nombre: 'Nombre' } as const;

export const Route = createFileRoute('/jugadores/')({
  validateSearch: parseSearch,
  loaderDeps: ({ search }) => pick(search, KEYS),
  loader: ({ context: { queryClient }, deps }) => queryClient.ensureQueryData(queries.players(deps)),
  component: PlayersPage,
});

const columns: ColumnDef<PlayerListItem, unknown>[] = [
  { id: 'jugador', accessorFn: (r) => r.player.name, header: 'Jugador', cell: ({ row }) => <PlayerLink player={row.original.player} className="font-medium" /> },
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
  { id: 'anios', accessorFn: (r) => r.firstYear, header: 'Años', cell: ({ row }) => (row.original.firstYear === row.original.lastYear ? row.original.firstYear : `${row.original.firstYear}–${row.original.lastYear}`) },
  { accessorKey: 'apps', header: 'PJ', meta: { align: 'right', title: 'Partidos jugados' } },
  { accessorKey: 'goals', header: 'Goles', meta: { align: 'right' } },
];

function PlayersPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { data } = useSuspenseQuery(queries.players(pick(search, KEYS)));
  useTitle('Jugadores');
  return (
    <div>
      <PageHeader title="Jugadores" subtitle="Todos los jugadores con al menos un partido registrado">
        <Select value={search.orden ?? 'partidos'} onValueChange={(v) => void navigate({ to: '.', search: (p) => ({ ...p, orden: v === 'partidos' ? undefined : v, pagina: undefined }) })}>
          <SelectTrigger className="w-40" aria-label="Ordenar por">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(ORDERS).map(([k, label]) => (
              <SelectItem key={k} value={k}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PageHeader>
      <FilterBar search={search} show={['temporada', 'rango', 'rama']} />
      <IgnoredFilters ignored={data.meta.ignoredFilters} />
      <DataTable data={data.data.items} columns={columns} caption="Jugadores" empty="No hay jugadores para este filtro." />
      <Pagination page={data.data.page} pageSize={data.data.pageSize} total={data.data.total} />
    </div>
  );
}
