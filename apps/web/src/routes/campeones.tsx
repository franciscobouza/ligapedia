import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FilterBar } from '@/components/filter-bar';
import { TeamLink, TournamentLink } from '@/components/links';
import { IgnoredFilters, PageHeader, Section } from '@/components/stats';
import { categoryLabel } from '@/lib/format';
import { es } from '@/lib/i18n/es';
import { queries } from '@/lib/queries';
import { parseSearch, pick } from '@/lib/search-params';
import { useTitle } from '@/lib/use-title';

const KEYS = ['rama', 'tipo', 'desde', 'hasta'] as const;

export const Route = createFileRoute('/campeones')({
  validateSearch: parseSearch,
  loaderDeps: ({ search }) => pick(search, KEYS),
  loader: ({ context: { queryClient }, deps }) => queryClient.ensureQueryData(queries.champions(deps)),
  component: ChampionsPage,
});

function ChampionsPage() {
  const search = Route.useSearch();
  const { data } = useSuspenseQuery(queries.champions(pick(search, KEYS)));
  const d = data.data;
  useTitle('Campeones');
  return (
    <div>
      <PageHeader title="Campeones" subtitle="Palmarés por temporada y ranking de campeonatos">
        <Link to="/sobre-los-datos" hash="campeones" className="text-sm underline-offset-4 hover:underline">
          ¿Cómo se determina el campeón?
        </Link>
      </PageHeader>
      <FilterBar search={search} show={['rango', 'rama', 'tipo']} />
      <IgnoredFilters ignored={data.meta.ignoredFilters} />
      <div className="grid gap-8 lg:grid-cols-[20rem_1fr]">
        <Section title="Ranking de campeonatos" className="mt-0">
          <ol className="divide-y rounded-lg border text-sm">
            {d.ranking.map((r) => (
              <li key={r.team.id} className="flex items-center gap-3 px-3 py-2">
                <span className="text-muted-foreground w-5 text-right tabular-nums">{r.rank}</span>
                <span className="flex-1">
                  <TeamLink team={r.team} /> <span className="text-muted-foreground text-xs">{categoryLabel(r.team.category)}</span>
                </span>
                <strong className="tabular-nums">{r.titles}</strong>
              </li>
            ))}
          </ol>
        </Section>
        <Section title="Por temporada" className="mt-0">
          <div className="space-y-3">
            {d.seasons.map((s) => (
              <Card key={s.year} className="gap-2 py-4">
                <CardHeader className="px-4">
                  <CardTitle className="text-base">
                    <Link to="/temporadas/$anio" params={{ anio: String(s.year) }} className="underline-offset-4 hover:underline">
                      {s.year}
                    </Link>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4">
                  <ul className="grid gap-1 text-sm sm:grid-cols-2">
                    {s.titles.map((t) => (
                      <li key={t.tournament.id} className="flex justify-between gap-2">
                        <TournamentLink tournament={t.tournament} withCategory={false} className="text-muted-foreground truncate" />
                        <span className="truncate text-right">
                          {t.champion.team ? <TeamLink team={t.champion.team} /> : <span className="text-muted-foreground">{es.champion.undetermined}</span>}
                          {t.tournament.category === 'F' && <span className="text-muted-foreground"> (F)</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}
