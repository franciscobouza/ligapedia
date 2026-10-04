import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FilterBar } from '@/components/filter-bar';
import { MatchLink, PlayerLink, TeamLink, TournamentLink } from '@/components/links';
import { Score } from '@/components/match';
import { CoverageNotice, IgnoredFilters, PageHeader, Section } from '@/components/stats';
import { categoryLabel } from '@/lib/format';
import { queries } from '@/lib/queries';
import { MATCH_RECORD_LABELS, PLAYER_METRIC_LABELS, TEAM_METRIC_LABELS } from '@/lib/records';
import { parseSearch, pick } from '@/lib/search-params';
import { useTitle } from '@/lib/use-title';

const KEYS = ['temporada', 'desde', 'hasta', 'rama', 'tipo'] as const;

export const Route = createFileRoute('/records/')({
  validateSearch: parseSearch,
  loaderDeps: ({ search }) => pick(search, KEYS),
  loader: ({ context: { queryClient }, deps }) => queryClient.ensureQueryData(queries.singleRecords(deps)),
  component: RecordsHub,
});

function LinkList({ title, items, carry }: { title: string; items: Array<{ to: string; params: Record<string, string>; label: string }>; carry: Record<string, unknown> }) {
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1.5 text-sm">
          {items.map((i) => (
            <li key={i.label}>
              <Link to={i.to as never} params={i.params as never} search={carry as never} className="underline-offset-4 hover:underline">
                {i.label}
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function RecordsHub() {
  const search = Route.useSearch();
  const { data } = useSuspenseQuery(queries.singleRecords(pick(search, KEYS)));
  const r = data.data;
  useTitle('Records');
  return (
    <div>
      <PageHeader title="Records" subtitle="Rankings históricos de jugadores, equipos y partidos" />
      <FilterBar search={search} show={['temporada', 'rango', 'rama', 'tipo']} />
      <IgnoredFilters ignored={data.meta.ignoredFilters} />
      <div className="grid gap-4 md:grid-cols-3">
        <LinkList
          carry={pick(search, KEYS)}
          title="Jugadores"
          items={Object.entries(PLAYER_METRIC_LABELS).map(([m, l]) => ({ to: '/records/jugadores/$metrica', params: { metrica: m }, label: l.title }))}
        />
        <LinkList
          carry={pick(search, KEYS)}
          title="Equipos"
          items={Object.entries(TEAM_METRIC_LABELS).map(([m, l]) => ({ to: '/records/equipos/$metrica', params: { metrica: m }, label: l.title }))}
        />
        <LinkList
          carry={pick(search, KEYS)}
          title="Partidos y temporadas"
          items={[
            ...Object.entries(MATCH_RECORD_LABELS).map(([t, l]) => ({ to: '/records/partidos/$tipo', params: { tipo: t }, label: l.title })),
            { to: '/records/goleadores-por-temporada', params: {}, label: 'Goleadores por temporada' },
            { to: '/campeones', params: {}, label: 'Campeones' },
          ]}
        />
      </div>
      <Section title="Más goles en un partido">
        <CoverageNotice coverage={r.coverage} kind="goals" />
        <ol className="divide-y rounded-lg border text-sm">
          {r.mostGoalsInMatch.map((x, i) => (
            <li key={`${x.player.id}-${x.match.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <span className="text-muted-foreground w-5 text-right tabular-nums">{i + 1}</span>
              <span className="flex-1">
                <PlayerLink player={x.player} /> <span className="text-muted-foreground">({x.team.name})</span>
              </span>
              <MatchLink match={x.match} className="text-muted-foreground text-xs">
                {x.match.home.name} <Score match={x.match} /> {x.match.away.name} · {x.match.tournament.seasonYear}
              </MatchLink>
              <strong className="tabular-nums">{x.goals}</strong>
            </li>
          ))}
        </ol>
      </Section>
      <div className="grid gap-6 md:grid-cols-2">
        <Section title="Más goles en una temporada">
          <ol className="divide-y rounded-lg border text-sm">
            {r.mostGoalsInSeason.map((x, i) => (
              <li key={`${x.player.id}-${x.seasonYear}`} className="flex items-center gap-3 px-3 py-2">
                <span className="text-muted-foreground w-5 text-right tabular-nums">{i + 1}</span>
                <span className="flex-1">
                  <PlayerLink player={x.player} />{' '}
                  <span className="text-muted-foreground">
                    {x.seasonYear} · {categoryLabel(x.category)}
                  </span>
                </span>
                <strong className="tabular-nums">{x.goals}</strong>
              </li>
            ))}
          </ol>
        </Section>
        <Section title="Más goles en un torneo">
          <ol className="divide-y rounded-lg border text-sm">
            {r.mostGoalsInTournament.map((x, i) => (
              <li key={`${x.player.id}-${x.tournament.id}`} className="flex items-center gap-3 px-3 py-2">
                <span className="text-muted-foreground w-5 text-right tabular-nums">{i + 1}</span>
                <span className="flex-1">
                  <PlayerLink player={x.player} /> <TournamentLink tournament={x.tournament} className="text-muted-foreground text-xs" />
                </span>
                <strong className="tabular-nums">{x.goals}</strong>
              </li>
            ))}
          </ol>
        </Section>
      </div>
      <Section title="Más rojas en un partido">
        <ol className="divide-y rounded-lg border text-sm">
          {r.mostRedCardsInMatch.map((x, i) => (
            <li key={x.match.id} className="flex items-center gap-3 px-3 py-2">
              <span className="text-muted-foreground w-5 text-right tabular-nums">{i + 1}</span>
              <MatchLink match={x.match} className="flex-1">
                <TeamLink team={x.match.home} /> <Score match={x.match} /> <TeamLink team={x.match.away} />
              </MatchLink>
              <span className="text-muted-foreground text-xs">{x.match.tournament.seasonYear}</span>
              <strong className="tabular-nums">{x.redCards}</strong>
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}
