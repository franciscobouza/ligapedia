import type { TeamListItem } from '@ligapedia/contracts';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DataTable } from '@/components/data-table';
import { FilterBar } from '@/components/filter-bar';
import { TeamLink } from '@/components/links';
import { Pagination } from '@/components/pagination';
import { IgnoredFilters, PageHeader } from '@/components/stats';
import { categoryLabel, formatPercent } from '@/lib/format';
import { queries } from '@/lib/queries';
import { parseSearch, pick } from '@/lib/search-params';
import { useTitle } from '@/lib/use-title';

const KEYS = ['temporada', 'desde', 'hasta', 'rama', 'orden', 'pagina'] as const;
const ORDERS = { partidos: 'Más partidos', victorias: 'Más victorias', titulos: 'Más campeonatos', porcentaje: '% de victorias', nombre: 'Nombre' } as const;

export const Route = createFileRoute('/equipos/')({
  validateSearch: parseSearch,
  loaderDeps: ({ search }) => pick(search, KEYS),
  loader: ({ context: { queryClient }, deps }) => queryClient.ensureQueryData(queries.teams(deps)),
  component: TeamsPage,
});

const columns: ColumnDef<TeamListItem, unknown>[] = [
  { id: 'equipo', accessorFn: (r) => r.team.name, header: 'Equipo', cell: ({ row }) => <TeamLink team={row.original.team} className="font-medium" /> },
  { id: 'rama', accessorFn: (r) => categoryLabel(r.team.category), header: 'Rama' },
  { id: 'anios', accessorFn: (r) => r.firstYear, header: 'Temporadas', cell: ({ row }) => `${row.original.firstYear}–${row.original.lastYear}` },
  { accessorKey: 'played', header: 'PJ', meta: { align: 'right', title: 'Partidos jugados' } },
  { accessorKey: 'winPct', header: '% victorias', meta: { align: 'right' }, cell: ({ getValue }) => formatPercent(getValue() as number | null) },
  { accessorKey: 'titles', header: 'Campeonatos', meta: { align: 'right' } },
];

function TeamsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { data } = useSuspenseQuery(queries.teams(pick(search, KEYS)));
  useTitle('Equipos');
  return (
    <div>
      <PageHeader title="Equipos" subtitle="Todos los equipos de futsal masculino y femenino">
        <Select value={search.orden ?? 'partidos'} onValueChange={(v) => void navigate({ to: '.', search: (p) => ({ ...p, orden: v === 'partidos' ? undefined : v, pagina: undefined }) })}>
          <SelectTrigger className="w-48" aria-label="Ordenar por">
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
      <DataTable data={data.data.items} columns={columns} caption="Equipos" empty="No hay equipos para este filtro." />
      <Pagination page={data.data.page} pageSize={data.data.pageSize} total={data.data.total} />
    </div>
  );
}
