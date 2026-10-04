import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TeamLink } from '@/components/links';
import { PageHeader } from '@/components/stats';
import { categoryLabel, formatInt } from '@/lib/format';
import { queries } from '@/lib/queries';
import { useTitle } from '@/lib/use-title';

export const Route = createFileRoute('/temporadas/')({
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(queries.seasons()),
  component: SeasonsPage,
});

function SeasonsPage() {
  const { data } = useSuspenseQuery(queries.seasons());
  useTitle('Temporadas');
  return (
    <div>
      <PageHeader title="Temporadas" subtitle={`${data.data.length} temporadas de futsal, de la más reciente a la más antigua`} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.data.map((s) => (
          <Card key={s.year} className="gap-3">
            <CardHeader>
              <CardTitle className="flex items-baseline justify-between gap-2">
                <Link to="/temporadas/$anio" params={{ anio: String(s.year) }} className="text-xl underline-offset-4 hover:underline">
                  {s.year}
                </Link>
                <span className="flex gap-1">
                  {s.categories.map((c) => (
                    <Badge key={c} variant="secondary">
                      {categoryLabel(c)}
                    </Badge>
                  ))}
                </span>
              </CardTitle>
              {s.name && <p className="text-muted-foreground text-xs">Temporada “{s.name}”</p>}
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-muted-foreground">
                {formatInt(s.matches)} partidos · {formatInt(s.goals)} goles
              </p>
              {s.champions.length > 0 && (
                <ul className="space-y-1">
                  {s.champions.map((c) => (
                    <li key={c.tournament.id} className="flex justify-between gap-2">
                      <span className="text-muted-foreground truncate">
                        {c.tournament.name}
                        {s.categories.length > 1 ? ` (${c.tournament.category})` : ''}
                      </span>
                      <span className="truncate text-right">{c.champion.team ? <TeamLink team={c.champion.team} /> : '—'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
