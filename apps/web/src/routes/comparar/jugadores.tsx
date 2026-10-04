import type { PlayerTotals } from '@ligapedia/contracts';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { EntityPicker } from '@/components/entity-picker';
import { MatchList } from '@/components/match';
import { ErrorState, PageSkeleton } from '@/components/states';
import { PageHeader, Section, StatCard } from '@/components/stats';
import { formatDecimal, formatPercent } from '@/lib/format';
import { es } from '@/lib/i18n/es';
import { queries } from '@/lib/queries';
import { parseSearch, pick } from '@/lib/search-params';
import { PlayerLink } from '@/components/links';
import { useTitle } from '@/lib/use-title';

export const Route = createFileRoute('/comparar/jugadores')({
  validateSearch: parseSearch,
  component: ComparePlayers,
});

const ROWS: Array<[string, (t: PlayerTotals) => string]> = [
  [es.stats.apps, (t) => String(t.apps)],
  [es.stats.goals, (t) => String(t.goals)],
  [es.stats.goalsPerMatch, (t) => formatDecimal(t.goalsPerMatch)],
  [es.stats.winPct, (t) => formatPercent(t.winPct)],
  ['Ganados / Empatados / Perdidos', (t) => `${t.wins} / ${t.draws} / ${t.losses}`],
  [es.stats.yellow, (t) => String(t.yellow)],
  [es.stats.red, (t) => String(t.red)],
  [es.stats.captain, (t) => String(t.captain)],
];

function ComparePlayers() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const ready = Boolean(search.a && search.b);
  const { data, isPending, error, refetch } = useQuery({ ...queries.comparePlayers(pick(search, ['a', 'b'])), enabled: ready });
  const { data: pa } = useQuery({ ...queries.player(search.a ?? 0), enabled: Boolean(search.a) });
  const { data: pb } = useQuery({ ...queries.player(search.b ?? 0), enabled: Boolean(search.b) });
  const d = data?.data;
  useTitle(d ? `${d.a.name} vs ${d.b.name}` : 'Comparar jugadores');
  return (
    <div>
      <PageHeader title="Comparar jugadores" subtitle="Partidos como rivales, como compañeros y carreras lado a lado">
        <Link to="/comparar/equipos" className="text-sm underline-offset-4 hover:underline">
          Comparar equipos
        </Link>
      </PageHeader>
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center">
        <EntityPicker type="player" label="Elegí el primer jugador" valueLabel={pa?.data.player.name} onSelect={(id) => void navigate({ to: '.', search: (p) => ({ ...p, a: id }) })} />
        <span className="text-muted-foreground text-center text-sm">vs</span>
        <EntityPicker type="player" label="Elegí el segundo jugador" valueLabel={pb?.data.player.name} onSelect={(id) => void navigate({ to: '.', search: (p) => ({ ...p, b: id }) })} />
      </div>
      {!ready ? (
        <p className="text-muted-foreground text-sm">Elegí dos jugadores para compararlos.</p>
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending || !d ? (
        <PageSkeleton />
      ) : (
        <>
          <Section title="Como rivales" className="mt-0">
            {d.opponents.played === 0 ? (
              <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm">No coincidieron en ningún partido como rivales.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <StatCard label="Partidos" value={d.opponents.played} />
                  <StatCard label={`Victorias de ${d.a.name}`} value={d.opponents.winsA} />
                  <StatCard label="Empates" value={d.opponents.draws} />
                  <StatCard label={`Victorias de ${d.b.name}`} value={d.opponents.lossesA} />
                  <StatCard label="Goles" value={`${d.opponents.goalsA} – ${d.opponents.goalsB}`} />
                </div>
                <div className="mt-4">
                  <MatchList matches={d.opponents.matches.map((m) => m.match)} showTournament />
                </div>
              </>
            )}
          </Section>
          <Section title="Como compañeros">
            {d.teammates.played === 0 ? (
              <p className="text-muted-foreground text-sm">Nunca jugaron en el mismo equipo.</p>
            ) : (
              <p className="text-sm">
                {d.teammates.played} partidos juntos: {d.teammates.wins} ganados, {d.teammates.draws} empatados y {d.teammates.losses} perdidos.
              </p>
            )}
          </Section>
          {d.opponents.played === 0 && d.teammates.played === 0 && <p className="text-muted-foreground mt-2 text-sm">No coincidieron en ningún partido.</p>}
          <Section title="Carreras">
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2 text-left font-medium" scope="col" />
                    <th className="p-2 text-right font-medium" scope="col">
                      <PlayerLink player={d.a} />
                    </th>
                    <th className="p-2 text-right font-medium" scope="col">
                      <PlayerLink player={d.b} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map(([label, fn]) => (
                    <tr key={label} className="border-b last:border-0">
                      <th className="text-muted-foreground p-2 text-left font-normal" scope="row">
                        {label}
                      </th>
                      <td className="p-2 text-right tabular-nums">{fn(d.totalsA)}</td>
                      <td className="p-2 text-right tabular-nums">{fn(d.totalsB)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
