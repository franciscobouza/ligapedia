import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Trophy } from 'lucide-react';
import { PlayerLink, TeamLink, tournamentLabel } from '@/components/links';
import { MatchList } from '@/components/match';
import { StandingsTable } from '@/components/standings';
import { PageHeader, Section, StatCard } from '@/components/stats';
import { formatDay, formatDecimal, formatInt, formatShare } from '@/lib/format';
import { es } from '@/lib/i18n/es';
import { queries } from '@/lib/queries';
import { entityParam, idFrom } from '@/lib/search-params';
import { useTitle } from '@/lib/use-title';

export const Route = createFileRoute('/torneos/$torneo')({
  loader: ({ context: { queryClient }, params }) => queryClient.ensureQueryData(queries.tournament(idFrom(params.torneo))),
  component: TournamentPage,
});

const ROLE_LABEL = { league: 'Fase de liga', knockout: 'Eliminatoria', final: 'Final', third_place: 'Tercer puesto' } as const;

function TournamentPage() {
  const { torneo } = Route.useParams();
  const { data } = useSuspenseQuery(queries.tournament(idFrom(torneo)));
  const d = data.data;
  useTitle(tournamentLabel(d.tournament));
  return (
    <div>
      <PageHeader
        title={tournamentLabel(d.tournament)}
        subtitle={
          <>
            {es.kinds[d.tournament.kind]} ·{' '}
            <Link to="/temporadas/$anio" params={{ anio: String(d.tournament.seasonYear) }} className="underline-offset-4 hover:underline">
              Temporada {d.tournament.seasonYear}
            </Link>
          </>
        }
      />
      <div className="mb-6 flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
        <Trophy className="size-5 text-amber-500" aria-hidden />
        <p className="text-sm">
          <span>Campeón: </span>
          {d.champion.team ? <TeamLink team={d.champion.team} className="font-semibold" /> : es.champion.undetermined}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="Partidos" value={formatInt(d.summary.matches)} />
        <StatCard label="Goles" value={formatInt(d.summary.goals)} />
        <StatCard label={es.stats.goalsPerMatch} value={formatDecimal(d.summary.goalsPerMatch)} />
        <StatCard label="Rojas" value={formatInt(d.summary.redCards)} />
        <StatCard label="Amarillas" value={formatInt(d.summary.yellowCards)} hint={d.summary.yellowCards === 0 ? 'Sin registro en la fuente' : undefined} />
      </div>
      <div className="mt-2 grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0">
          {d.phases.map((p) => (
            <Section
              key={p.phase.id}
              title={p.phase.name}
              actions={
                <span className="text-muted-foreground flex items-center gap-3 text-xs">
                  {ROLE_LABEL[p.phase.role]} · {formatDay(p.startDate)} – {formatDay(p.endDate)}
                  <Link to="/torneos/$torneo/fases/$fase" params={{ torneo: entityParam(d.tournament), fase: String(p.phase.id) }} className="text-foreground font-medium underline-offset-4 hover:underline">
                    Ver fechas
                  </Link>
                </span>
              }
            >
              {p.standings ? <StandingsTable standings={p.standings} /> : <MatchList matches={p.matches} />}
            </Section>
          ))}
        </div>
        <Section title="Goleadores del torneo">
          <ol className="space-y-2 rounded-lg border p-3 text-sm">
            {d.topScorers.length === 0 && <li className="text-muted-foreground">Sin goles con autor registrado.</li>}
            {d.topScorers.map((r) => (
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
          {d.summary.attributedShare !== null && d.summary.attributedShare < 1 && (
            <p className="text-muted-foreground mt-2 text-xs">El {formatShare(d.summary.attributedShare)} de los goles tienen autor registrado.</p>
          )}
        </Section>
      </div>
    </div>
  );
}
