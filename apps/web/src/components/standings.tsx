import type { StandingRow, Standings } from '@ligapedia/contracts';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/data-table';
import { TeamLink } from '@/components/links';
import { es } from '@/lib/i18n/es';

const num = (key: keyof StandingRow, header: string, title: string): ColumnDef<StandingRow, unknown> => ({
  accessorKey: key,
  header,
  meta: { align: 'right', title },
});

const columns: ColumnDef<StandingRow, unknown>[] = [
  {
    id: 'team',
    accessorFn: (r) => r.team.name,
    header: 'Equipo',
    cell: ({ row }) => (
      <span className="flex items-center gap-2 whitespace-nowrap">
        <span className="text-muted-foreground w-5 text-right tabular-nums">{row.original.position}</span>
        <TeamLink team={row.original.team} />
      </span>
    ),
    sortingFn: (a, b) => a.original.position - b.original.position,
  },
  num('pj', es.stats.pj, 'Partidos jugados'),
  num('pg', es.stats.pg, 'Partidos ganados'),
  num('pe', es.stats.pe, 'Partidos empatados'),
  num('pp', es.stats.pp, 'Partidos perdidos'),
  num('gf', es.stats.gf, 'Goles a favor'),
  num('gc', es.stats.gc, 'Goles en contra'),
  num('dg', es.stats.dg, 'Diferencia de gol'),
  { ...num('pts', es.stats.pts, 'Puntos'), cell: ({ getValue }) => <strong>{getValue() as number}</strong> },
];

export function StandingsTable({ standings, highlightTeamId }: { standings: Standings; highlightTeamId?: number }) {
  return (
    <div>
      <DataTable
        data={standings.rows}
        columns={columns}
        caption="Tabla de posiciones"
        rowClassName={(r) => (r.team.id === highlightTeamId ? 'bg-muted/60 font-medium' : undefined)}
      />
      {standings.type === 'computed' && (
        <p className="text-muted-foreground mt-2 text-xs">
          {standings.afterRound ? `Tabla calculada después de la fecha ${standings.afterRound}` : 'Tabla calculada a partir de los resultados'}
        </p>
      )}
    </div>
  );
}
