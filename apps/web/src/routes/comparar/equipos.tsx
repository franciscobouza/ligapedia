import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Card, CardContent } from '@/components/ui/card';
import { EntityPicker } from '@/components/entity-picker';
import { FilterBar } from '@/components/filter-bar';
import { MatchLink, TeamLink } from '@/components/links';
import { MatchList, Score } from '@/components/match';
import { ErrorState, PageSkeleton } from '@/components/states';
import { PageHeader, Section, StatCard } from '@/components/stats';
import { queries } from '@/lib/queries';
import { parseSearch, pick } from '@/lib/search-params';
import { useTitle } from '@/lib/use-title';

const KEYS = ['a', 'b', 'temporada', 'desde', 'hasta', 'torneo', 'tipo'] as const;

export const Route = createFileRoute('/comparar/equipos')({
  validateSearch: parseSearch,
  component: CompareTeams,
});

function CompareTeams() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const ready = Boolean(search.a && search.b);
  const { data, isPending, error, refetch } = useQuery({ ...queries.compareTeams(pick(search, KEYS)), enabled: ready });
  const { data: teamA } = useQuery({ ...queries.team(search.a ?? 0), enabled: Boolean(search.a) });
  const { data: teamB } = useQuery({ ...queries.team(search.b ?? 0), enabled: Boolean(search.b) });
  const d = data?.data;
  useTitle(d ? `${d.a.name} vs ${d.b.name}` : 'Comparar equipos');
  return (
    <div>
      <PageHeader title="Comparar equipos" subtitle="Historial entre dos equipos de la misma rama">
        <Link to="/comparar/jugadores" className="text-sm underline-offset-4 hover:underline">
          Comparar jugadores
        </Link>
      </PageHeader>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <EntityPicker type="team" label="Elegí el primer equipo" valueLabel={teamA?.data.team.name} onSelect={(id) => void navigate({ to: '.', search: (p) => ({ ...p, a: id }) })} />
        <span className="text-muted-foreground text-center text-sm">vs</span>
        <EntityPicker type="team" label="Elegí el segundo equipo" valueLabel={teamB?.data.team.name} onSelect={(id) => void navigate({ to: '.', search: (p) => ({ ...p, b: id }) })} />
      </div>
      {ready && <FilterBar search={search} show={['rango', 'tipo']} />}
      {!ready ? (
        <p className="text-muted-foreground text-sm">Elegí dos equipos para ver su historial.</p>
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending || !d ? (
        <PageSkeleton />
      ) : d.played === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm">
          <TeamLink team={d.a} /> y <TeamLink team={d.b} /> no se enfrentaron {search.desde || search.hasta || search.tipo ? 'con estos filtros' : 'nunca'}.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <StatCard label="Partidos" value={d.played} />
            <StatCard label={`Victorias ${d.a.name}`} value={d.winsA} />
            <StatCard label="Empates" value={d.draws} />
            <StatCard label={`Victorias ${d.b.name}`} value={d.winsB} />
            <StatCard label="Goles" value={`${d.goalsA} – ${d.goalsB}`} />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(
              [
                [`Mayor victoria de ${d.a.name}`, d.biggestWinA],
                [`Mayor victoria de ${d.b.name}`, d.biggestWinB],
              ] as const
            ).map(([label, m]) => (
              <Card key={label} className="py-4">
                <CardContent className="px-4 text-sm">
                  <p className="text-muted-foreground text-xs">{label}</p>
                  {m ? (
                    <MatchLink match={m}>
                      {m.home.name} <Score match={m} /> {m.away.name}
                    </MatchLink>
                  ) : (
                    '—'
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
          <Section title="Todos los partidos">
            <MatchList matches={d.matches} showTournament />
          </Section>
        </>
      )}
    </div>
  );
}
