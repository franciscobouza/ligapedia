import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MatchLink, PlayerLink, TeamLink, TournamentLink } from '@/components/links';
import { MatchList, Score } from '@/components/match';
import { StandingsTable } from '@/components/standings';
import { Section, StatCard } from '@/components/stats';
import { categoryLabel, formatInt } from '@/lib/format';
import { es } from '@/lib/i18n/es';
import { queries } from '@/lib/queries';
import { useTitle } from '@/lib/use-title';

export const Route = createFileRoute('/')({
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(queries.home()),
  component: HomePage,
});

function HomePage() {
  const { data } = useSuspenseQuery(queries.home());
  const h = data.data;
  useTitle(undefined);
  return (
    <div>
      <section className="from-primary/5 mb-8 rounded-xl border bg-gradient-to-br to-transparent p-6 sm:p-8">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{es.site.tagline}</h1>
        <p className="text-muted-foreground mt-2 max-w-2xl">
          Resultados, tablas, jugadores, equipos y records del futsal de la LUD desde 2006, actualizados todos los días a las 3 de la mañana.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatCard label="Temporadas" value={formatInt(h.totals.seasons)} />
          <StatCard label="Partidos" value={formatInt(h.totals.matches)} />
          <StatCard label="Goles" value={formatInt(h.totals.goals)} />
          <StatCard label="Jugadores" value={formatInt(h.totals.players)} />
          <StatCard label="Equipos" value={formatInt(h.totals.teams)} />
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0">
          <Section
            title={`Últimos resultados${h.seasonYear ? ` · ${h.seasonYear}` : ''}`}
            actions={
              h.seasonYear ? (
                <Link to="/temporadas/$anio" params={{ anio: String(h.seasonYear) }} className="text-sm underline-offset-4 hover:underline">
                  Ver temporada
                </Link>
              ) : undefined
            }
            className="mt-0"
          >
            <MatchList matches={h.recentResults} showTournament />
          </Section>
          {h.upcoming.length > 0 && (
            <Section title="Próximos partidos">
              <MatchList matches={h.upcoming} showTournament />
            </Section>
          )}
          {h.standings.map((s) => (
            <Section key={s.phaseId} title={`Posiciones · ${s.tournament.name} ${s.tournament.seasonYear} · ${categoryLabel(s.tournament.category)}`}>
              <StandingsTable standings={s.standings} />
              <p className="mt-2 text-sm">
                <Link to="/torneos/$torneo/fases/$fase" params={{ torneo: `${s.tournament.id}-${s.tournament.slug}`, fase: String(s.phaseId) }} className="underline-offset-4 hover:underline">
                  Ver fase {s.phaseName}
                </Link>
              </p>
            </Section>
          ))}
        </div>
        <aside className="space-y-6">
          {h.topScorers.map((group) => (
            <Card key={group.category}>
              <CardHeader>
                <CardTitle className="text-base">
                  Goleadores {h.seasonYear} · {categoryLabel(group.category)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-2 text-sm">
                  {group.scorers.map((s) => (
                    <li key={s.player.id} className="flex items-center gap-2">
                      <span className="text-muted-foreground w-5 text-right tabular-nums">{s.rank}</span>
                      <span className="min-w-0 flex-1 truncate">
                        <PlayerLink player={s.player} />
                        <span className="text-muted-foreground block truncate text-xs">{s.teams.map((t) => t.name).join(', ')}</span>
                      </span>
                      <span className="font-semibold tabular-nums">{s.goals}</span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ))}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Records históricos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {h.highlights.allTimeTopScorer && (
                <p>
                  <span className="text-muted-foreground block text-xs">Máximo goleador</span>
                  <PlayerLink player={h.highlights.allTimeTopScorer} /> · {formatInt(h.highlights.allTimeTopScorer.goals)} goles
                </p>
              )}
              {h.highlights.mostApps && (
                <p>
                  <span className="text-muted-foreground block text-xs">Más partidos jugados</span>
                  <PlayerLink player={h.highlights.mostApps} /> · {formatInt(h.highlights.mostApps.apps)} partidos
                </p>
              )}
              {h.highlights.mostTitles && (
                <p>
                  <span className="text-muted-foreground block text-xs">Más campeonatos</span>
                  <TeamLink team={h.highlights.mostTitles} /> · {h.highlights.mostTitles.titles}
                </p>
              )}
              {h.highlights.biggestWin && (
                <p>
                  <span className="text-muted-foreground block text-xs">Mayor goleada</span>
                  <MatchLink match={h.highlights.biggestWin}>
                    {h.highlights.biggestWin.home.name} <Score match={h.highlights.biggestWin} /> {h.highlights.biggestWin.away.name}
                  </MatchLink>
                  <span className="text-muted-foreground block text-xs">
                    <TournamentLink tournament={h.highlights.biggestWin.tournament} />
                  </span>
                </p>
              )}
              <Link to="/records" className="inline-block pt-1 font-medium underline-offset-4 hover:underline">
                Ver todos los records →
              </Link>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
