import type { MatchDetail } from '@ligapedia/contracts';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PlayerLink, TeamLink, tournamentLabel } from '@/components/links';
import { DoubtfulDate, MatchList, Score } from '@/components/match';
import { Section } from '@/components/stats';
import { formatMatchDate, formatTime } from '@/lib/format';
import { es } from '@/lib/i18n/es';
import { queries } from '@/lib/queries';
import { entityParam } from '@/lib/search-params';
import { useTitle } from '@/lib/use-title';

export const Route = createFileRoute('/partidos/$id')({
  loader: ({ context: { queryClient }, params }) => queryClient.ensureQueryData(queries.match(Number(params.id))),
  component: MatchPage,
});

function GoalList({ d, side }: { d: MatchDetail; side: 'H' | 'A' }) {
  const goals = d.goals.filter((g) => g.side === side);
  const missing = side === 'H' ? d.unattributed.home : d.unattributed.away;
  if (d.match.walkOver) return null;
  if (!goals.length && !missing) return <p className="text-muted-foreground text-sm">Sin goles</p>;
  return (
    <ul className="space-y-1 text-sm">
      {goals.map((g, i) => (
        <li key={i} className="flex gap-2">
          <span className="text-muted-foreground w-8 shrink-0 text-right tabular-nums">{g.minute !== null ? `${g.minute}'` : ''}</span>
          <span>
            {g.player ? <PlayerLink player={g.player} /> : 'Jugador sin nombre'} {g.ownGoal && <span className="text-muted-foreground">{es.match.ownGoal}</span>}
          </span>
        </li>
      ))}
      {Array.from({ length: missing }, (_, i) => (
        <li key={`u${i}`} className="text-muted-foreground flex gap-2 italic">
          <span className="w-8 shrink-0" />
          <span>{es.match.unattributed}</span>
        </li>
      ))}
    </ul>
  );
}

function Lineup({ rows }: { rows: MatchDetail['lineups']['home'] }) {
  if (!rows.length) return <p className="text-muted-foreground text-sm">{es.match.noLineup}</p>;
  return (
    <ul className="space-y-1 text-sm">
      {rows.map((l) => (
        <li key={l.player.id} className="flex items-center gap-2">
          <span className="text-muted-foreground w-6 text-right tabular-nums">{l.shirt ?? ''}</span>
          <PlayerLink player={l.player} />
          {l.captain && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]" title="Capitán">
              C
            </Badge>
          )}
        </li>
      ))}
    </ul>
  );
}

function CardsList({ d, side }: { d: MatchDetail; side: 'H' | 'A' }) {
  const cards = d.cards.filter((c) => c.side === side);
  if (!cards.length) return null;
  return (
    <ul className="space-y-1 text-sm">
      {cards.map((c, i) => (
        <li key={i} className="flex items-center gap-2">
          <span role="img" className={c.color === 'R' ? 'h-4 w-3 rounded-sm bg-rose-600' : 'h-4 w-3 rounded-sm bg-amber-400'} aria-label={c.color === 'R' ? 'Tarjeta roja' : 'Tarjeta amarilla'} />
          {c.player ? <PlayerLink player={c.player} /> : <span>{c.name}</span>}
          {c.observations && <span className="text-muted-foreground text-xs">· {c.observations}</span>}
        </li>
      ))}
    </ul>
  );
}

function MatchPage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(queries.match(Number(id)));
  const d = data.data;
  const m = d.match;
  useTitle(`${m.home.name} vs ${m.away.name}`);
  return (
    <div>
      <p className="text-muted-foreground mb-3 text-sm">
        <Link to="/temporadas/$anio" params={{ anio: String(m.tournament.seasonYear) }} className="underline-offset-4 hover:underline">
          Temporada {m.tournament.seasonYear}
        </Link>{' '}
        ·{' '}
        <Link to="/torneos/$torneo" params={{ torneo: entityParam(m.tournament) }} className="underline-offset-4 hover:underline">
          {tournamentLabel(m.tournament)}
        </Link>{' '}
        ·{' '}
        <Link to="/torneos/$torneo/fases/$fase" params={{ torneo: entityParam(m.tournament), fase: String(m.phase.id) }} search={{ fecha: m.round }} className="underline-offset-4 hover:underline">
          {m.phase.name} · Fecha {m.round}
        </Link>
        {d.leg ? ` · Rueda ${d.leg}` : ''}
      </p>
      <h1 className="sr-only">
        {m.home.name} {m.homeGoals ?? ''} – {m.awayGoals ?? ''} {m.away.name}
      </h1>
      <Card className="mb-6">
        <CardContent className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 py-2 text-center">
          <div className="text-lg font-semibold sm:text-2xl">
            <TeamLink team={m.home} />
          </div>
          <div className="text-3xl sm:text-5xl">
            <Score match={m} />
          </div>
          <div className="text-lg font-semibold sm:text-2xl">
            <TeamLink team={m.away} />
          </div>
          <p className="text-muted-foreground col-span-3 text-sm">
            {formatMatchDate(m.kickoff)} {m.kickoff && `· ${formatTime(m.kickoff)}`} · {m.venue ?? es.match.venueUnknown} {m.doubtfulDate && <DoubtfulDate />}
          </p>
        </CardContent>
      </Card>

      {m.walkOver && (
        <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm" role="note">
          <strong>{es.match.walkOverWon}</strong>
          {d.winner && (
            <>
              {' '}
              · Ganador: <TeamLink team={d.winner} />
            </>
          )}
        </div>
      )}
      {d.observations && (
        <p className="bg-muted mb-6 rounded-md px-4 py-3 text-sm" role="note">
          <span className="font-medium">Observaciones: </span>
          {d.observations}
        </p>
      )}
      {d.inconsistent && (
        <p className="mb-6 flex items-center gap-2 rounded-md border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm" role="note">
          <AlertTriangle className="size-4" aria-hidden /> {es.match.inconsistent}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {(['H', 'A'] as const).map((side) => (
          <Card key={side}>
            <CardHeader>
              <CardTitle className="text-base">{side === 'H' ? m.home.name : m.away.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-muted-foreground mb-1 text-xs font-medium uppercase">Goles</h3>
                <GoalList d={d} side={side} />
              </div>
              <CardsList d={d} side={side} />
              <div>
                <h3 className="text-muted-foreground mb-1 text-xs font-medium uppercase">Formación</h3>
                <Lineup rows={side === 'H' ? d.lineups.home : d.lineups.away} />
              </div>
              {d.substitutions.some((s) => s.side === side) && (
                <div>
                  <h3 className="text-muted-foreground mb-1 text-xs font-medium uppercase">Cambios</h3>
                  <ul className="space-y-1 text-sm">
                    {d.substitutions
                      .filter((s) => s.side === side)
                      .map((s, i) => (
                        <li key={i}>
                          {s.minute !== null ? `${s.minute}' ` : ''}↑ {s.playerIn} · ↓ {s.playerOut}
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Section title="Árbitros">
        {d.referees.length ? (
          <ul className="text-sm">
            {d.referees.map((r, i) => (
              <li key={i}>
                <span className="text-muted-foreground">{r.role}:</span> {r.name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">{es.match.noReferees}</p>
        )}
      </Section>

      <Section
        title={es.match.headToHead}
        actions={
          <Link to="/comparar/equipos" search={{ a: m.home.id, b: m.away.id }} className="text-sm underline-offset-4 hover:underline">
            Historial completo
          </Link>
        }
      >
        <p className="mb-3 text-sm">
          {d.headToHead.matches === 0
            ? 'Es el primer enfrentamiento registrado entre ambos.'
            : `${d.headToHead.matches} partidos previos: ${d.headToHead.homeWins} victorias de ${m.home.name}, ${d.headToHead.awayWins} de ${m.away.name} y ${d.headToHead.draws} empates.`}
        </p>
        {d.headToHead.previous.length > 0 && <MatchList matches={d.headToHead.previous} showTournament />}
      </Section>

      <p className="mt-8 text-sm">
        <a href={d.officialUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline-offset-4 hover:underline">
          {es.match.officialSite} <ExternalLink className="size-3.5" />
        </a>
      </p>
    </div>
  );
}
