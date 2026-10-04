import type { MatchRecordType } from '@ligapedia/contracts';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { FilterBar } from '@/components/filter-bar';
import { MatchLink, TeamLink, TournamentLink } from '@/components/links';
import { Score } from '@/components/match';
import { EmptyState } from '@/components/states';
import { IgnoredFilters, PageHeader } from '@/components/stats';
import { formatShortDate } from '@/lib/format';
import { queries } from '@/lib/queries';
import { MATCH_RECORD_LABELS } from '@/lib/records';
import { parseSearch, pick } from '@/lib/search-params';
import { useTitle } from '@/lib/use-title';

const KEYS = ['temporada', 'desde', 'hasta', 'rama', 'torneo', 'tipo', 'top'] as const;

export const Route = createFileRoute('/records/partidos/$tipo')({
  validateSearch: parseSearch,
  loaderDeps: ({ search }) => pick(search, KEYS),
  loader: ({ context: { queryClient }, params, deps }) => {
    if (!(params.tipo in MATCH_RECORD_LABELS)) throw notFound();
    return queryClient.ensureQueryData(queries.matchRecords(params.tipo, deps));
  },
  component: MatchRecordsPage,
});

function MatchRecordsPage() {
  const { tipo } = Route.useParams();
  const search = Route.useSearch();
  const { data } = useSuspenseQuery(queries.matchRecords(tipo, pick(search, KEYS)));
  const label = MATCH_RECORD_LABELS[tipo as MatchRecordType];
  useTitle(label.title);
  return (
    <div>
      <PageHeader title={label.title} subtitle={<Link to="/records" className="underline-offset-4 hover:underline">← Records · no incluye partidos ganados por W.O.</Link>} />
      <FilterBar search={search} show={['temporada', 'rango', 'rama', 'tipo', 'top']} />
      <IgnoredFilters ignored={data.meta.ignoredFilters} />
      {data.data.rows.length === 0 ? (
        <EmptyState />
      ) : (
        <ol className="divide-y rounded-lg border text-sm">
          {data.data.rows.map((r) => (
            <li key={r.match.id} className="grid grid-cols-[2rem_1fr_auto] items-center gap-x-3 gap-y-1 px-3 py-2.5 sm:grid-cols-[2rem_1fr_auto_auto]">
              <span className="text-muted-foreground text-right tabular-nums">{r.rank}</span>
              <span className="min-w-0">
                <TeamLink team={r.match.home} />{' '}
                <MatchLink match={r.match}>
                  <Score match={r.match} />
                </MatchLink>{' '}
                <TeamLink team={r.match.away} />
                <span className="text-muted-foreground block text-xs">
                  {formatShortDate(r.match.kickoff)} · <TournamentLink tournament={r.match.tournament} />
                </span>
              </span>
              <strong className="tabular-nums">{r.value}</strong>
              <span className="text-muted-foreground hidden text-xs sm:inline">{label.unit}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
