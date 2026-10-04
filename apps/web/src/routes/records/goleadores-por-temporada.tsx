import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { FilterBar } from '@/components/filter-bar';
import { PlayerLink } from '@/components/links';
import { IgnoredFilters, PageHeader } from '@/components/stats';
import { categoryLabel, formatShare } from '@/lib/format';
import { queries } from '@/lib/queries';
import { parseSearch, pick } from '@/lib/search-params';
import { useTitle } from '@/lib/use-title';

const KEYS = ['rama', 'desde', 'hasta'] as const;

export const Route = createFileRoute('/records/goleadores-por-temporada')({
  validateSearch: parseSearch,
  loaderDeps: ({ search }) => pick(search, KEYS),
  loader: ({ context: { queryClient }, deps }) => queryClient.ensureQueryData(queries.seasonTopScorers(deps)),
  component: SeasonScorersPage,
});

function SeasonScorersPage() {
  const search = Route.useSearch();
  const { data } = useSuspenseQuery(queries.seasonTopScorers(pick(search, KEYS)));
  useTitle('Goleadores por temporada');
  return (
    <div>
      <PageHeader title="Goleadores por temporada" subtitle={<Link to="/records" className="underline-offset-4 hover:underline">← Records</Link>} />
      <FilterBar search={search} show={['rango', 'rama']} />
      <IgnoredFilters ignored={data.meta.ignoredFilters} />
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="p-2 font-medium">Temporada</th>
              <th className="p-2 font-medium">Rama</th>
              <th className="p-2 font-medium">Goleador</th>
              <th className="p-2 text-right font-medium">Goles</th>
              <th className="p-2 text-right font-medium" title="Goles con autor registrado">Con autor</th>
            </tr>
          </thead>
          <tbody>
            {data.data.seasons.map((s) => (
              <tr key={`${s.seasonYear}-${s.category}`} className="border-b last:border-0">
                <td className="p-2">
                  <Link to="/temporadas/$anio" params={{ anio: String(s.seasonYear) }} className="underline-offset-4 hover:underline">
                    {s.seasonYear}
                  </Link>
                </td>
                <td className="p-2">{categoryLabel(s.category)}</td>
                <td className="p-2">
                  {s.scorers.map((x, i) => (
                    <span key={x.player.id}>
                      {i > 0 && ', '}
                      <PlayerLink player={x.player} /> <span className="text-muted-foreground text-xs">({x.teams.map((t) => t.name).join(', ')})</span>
                    </span>
                  ))}
                </td>
                <td className="p-2 text-right font-semibold tabular-nums">{s.scorers[0]?.goals}</td>
                <td className="text-muted-foreground p-2 text-right tabular-nums">{formatShare(s.attributedShare)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
