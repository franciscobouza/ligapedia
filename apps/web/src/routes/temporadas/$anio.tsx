import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Trophy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PlayerLink, TeamLink } from '@/components/links';
import { PageHeader, Section, StatCard } from '@/components/stats';
import { categoryLabel, formatDay, formatDecimal, formatInt, formatShare } from '@/lib/format';
import { es } from '@/lib/i18n/es';
import { queries } from '@/lib/queries';
import { entityParam } from '@/lib/search-params';
import { useTitle } from '@/lib/use-title';

export const Route = createFileRoute('/temporadas/$anio')({
  loader: ({ context: { queryClient }, params }) => queryClient.ensureQueryData(queries.season(Number(params.anio))),
  component: SeasonPage,
});

function SeasonPage() {
  const { anio } = Route.useParams();
  const { data } = useSuspenseQuery(queries.season(Number(anio)));
  const s = data.data;
  useTitle(`Temporada ${s.year}`);
  return (
    <div>
      <PageHeader title={`Temporada ${s.year}`} subtitle={s.name ? `Temporada “${s.name}”` : 'Futsal de la Liga Universitaria'} />
      {s.categories.map((c) => (
        <section key={c.category} className="mb-10" aria-label={categoryLabel(c.category)}>
          <h2 className="mb-4 text-xl font-semibold">{categoryLabel(c.category)}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Partidos" value={formatInt(c.matches)} />
            <StatCard label="Goles" value={formatInt(c.goals)} />
            <StatCard label={es.stats.goalsPerMatch} value={formatDecimal(c.goalsPerMatch)} />
            <StatCard label="Goles con autor registrado" value={formatShare(c.attributedShare)} />
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
            <div className="space-y-4">
              {c.tournaments.map((t) => (
                <Card key={t.tournament.id} className="gap-3">
                  <CardHeader>
                    <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                      <Link to="/torneos/$torneo" params={{ torneo: entityParam(t.tournament) }} className="underline-offset-4 hover:underline">
                        {t.tournament.name}
                      </Link>
                      <span className="flex items-center gap-1.5 text-sm font-normal">
                        <Trophy className="size-4 text-amber-500" aria-hidden />
                        {t.champion.team ? <TeamLink team={t.champion.team} /> : <span className="text-muted-foreground">{es.champion.undetermined}</span>}
                      </span>
                    </CardTitle>
                    <p className="text-muted-foreground text-xs">
                      {es.kinds[t.tournament.kind]} · {formatDay(t.startDate)} – {formatDay(t.endDate)}
                    </p>
                  </CardHeader>
                  <CardContent>
                    <ul className="flex flex-wrap gap-2">
                      {t.phases.map((p) => (
                        <li key={p.phase.id}>
                          <Link to="/torneos/$torneo/fases/$fase" params={{ torneo: entityParam(t.tournament), fase: String(p.phase.id) }}>
                            <Badge variant="outline" className="hover:bg-accent">
                              {p.phase.name} · {p.matches}
                            </Badge>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
            <Section title="Goleadores de la temporada" className="mt-0">
              <ol className="space-y-2 rounded-lg border p-3 text-sm">
                {c.topScorers.length === 0 && <li className="text-muted-foreground">Sin goles con autor registrado.</li>}
                {c.topScorers.map((r) => (
                  <li key={r.player.id} className="flex items-center gap-2">
                    <span className="text-muted-foreground w-5 text-right tabular-nums">{r.rank}</span>
                    <span className="min-w-0 flex-1 truncate">
                      <PlayerLink player={r.player} />
                      <span className="text-muted-foreground block truncate text-xs">{r.teams.map((t) => t.name).join(', ')}</span>
                    </span>
                    <span className="font-semibold tabular-nums">{r.goals}</span>
                  </li>
                ))}
              </ol>
            </Section>
          </div>
        </section>
      ))}
    </div>
  );
}
