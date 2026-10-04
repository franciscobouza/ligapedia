import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { tournamentLabel } from '@/components/links';
import { MatchList } from '@/components/match';
import { StandingsTable } from '@/components/standings';
import { IgnoredFilters, PageHeader, Section } from '@/components/stats';
import { formatDay } from '@/lib/format';
import { queries } from '@/lib/queries';
import { entityParam, idFrom, parseSearch, pick } from '@/lib/search-params';
import { useTitle } from '@/lib/use-title';

const KEYS = ['fecha', 'despues'] as const;
const ALL = '__all';

export const Route = createFileRoute('/torneos/$torneo_/fases/$fase')({
  validateSearch: parseSearch,
  loaderDeps: ({ search }) => pick(search, KEYS),
  loader: ({ context: { queryClient }, params, deps }) => queryClient.ensureQueryData(queries.phase(idFrom(params.fase), deps)),
  component: PhasePage,
});

function PhasePage() {
  const { fase } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { data } = useSuspenseQuery(queries.phase(idFrom(fase), pick(search, KEYS)));
  const d = data.data;
  useTitle(`${d.phase.name} · ${tournamentLabel(d.tournament)}`);
  const setSearch = (patch: { fecha?: number; despues?: number }) => void navigate({ to: '.', search: (prev) => ({ ...prev, ...patch }) });
  return (
    <div>
      <PageHeader
        title={d.phase.name}
        subtitle={
          <Link to="/torneos/$torneo" params={{ torneo: entityParam(d.tournament) }} className="underline-offset-4 hover:underline">
            {tournamentLabel(d.tournament)}
          </Link>
        }
      />
      <IgnoredFilters ignored={data.meta.ignoredFilters} />
      <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
        <Section
          title="Fechas y resultados"
          className="mt-0"
          actions={
            d.rounds.length > 1 ? (
              <Select value={search.fecha ? String(search.fecha) : ALL} onValueChange={(v) => setSearch({ fecha: v === ALL ? undefined : Number(v) })}>
                <SelectTrigger className="w-44" aria-label="Fecha">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todas las fechas</SelectItem>
                  {d.rounds.map((r) => (
                    <SelectItem key={r.round} value={String(r.round)}>
                      Fecha {r.round} · {formatDay(r.startDate)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : undefined
          }
        >
          {d.rounds
            .filter((r) => d.selectedRound === null || r.round === d.selectedRound)
            .map((r) => (
              <div key={r.round} className="mb-4">
                <h3 className="text-muted-foreground mb-2 text-sm font-medium">Fecha {r.round}</h3>
                <MatchList matches={d.matches.filter((m) => m.round === r.round)} />
              </div>
            ))}
        </Section>
        {(d.phase.role === 'league' || d.standings) && (
          <Section
            title="Posiciones"
            className="mt-0"
            actions={
              d.rounds.length > 1 ? (
                <Select value={search.despues ? String(search.despues) : ALL} onValueChange={(v) => setSearch({ despues: v === ALL ? undefined : Number(v) })}>
                  <SelectTrigger className="w-48" aria-label="Posiciones después de la fecha">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Tabla final</SelectItem>
                    {d.rounds.map((r) => (
                      <SelectItem key={r.round} value={String(r.round)}>
                        Después de la fecha {r.round}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : undefined
            }
          >
            {d.standings ? <StandingsTable standings={d.standings} /> : <p className="text-muted-foreground text-sm">Sin tabla para esta fase.</p>}
            {d.standings?.type === 'official' && <p className="text-muted-foreground mt-2 text-xs">Tabla oficial publicada por la Liga.</p>}
          </Section>
        )}
      </div>
      <p className="text-muted-foreground mt-8 text-xs">Nombre en la fuente: “{d.sourceName}”</p>
    </div>
  );
}
