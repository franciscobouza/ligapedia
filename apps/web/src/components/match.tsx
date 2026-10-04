import type { MatchSummary, Result } from '@ligapedia/contracts';
import { AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { EmptyState } from '@/components/states';
import { MatchLink, TeamLink, TournamentLink } from '@/components/links';
import { formatMatchDate, formatTime } from '@/lib/format';
import { es } from '@/lib/i18n/es';
import { cn } from '@/lib/utils';

const RESULT_STYLES: Record<Result, string> = {
  G: 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-emerald-950',
  E: 'bg-amber-500 text-amber-950 dark:bg-amber-400',
  P: 'bg-rose-600 text-white dark:bg-rose-500 dark:text-rose-950',
};

export function ResultBadge({ result, className }: { result: Result; className?: string }) {
  return (
    <span
      className={cn('inline-flex size-6 items-center justify-center rounded text-xs font-bold', RESULT_STYLES[result], className)}
      title={es.results[result]}
      aria-label={es.results[result]}
    >
      {es.resultShort[result]}
    </span>
  );
}

export function Score({ match, className }: { match: MatchSummary; className?: string }) {
  if (match.status === 'programado' || match.homeGoals === null || match.awayGoals === null) {
    return <span className={cn('text-muted-foreground text-xs font-medium uppercase', className)}>{es.match.scheduled}</span>;
  }
  return (
    <span className={cn('font-semibold tabular-nums', className)}>
      {match.homeGoals} – {match.awayGoals}
    </span>
  );
}

export function DoubtfulDate() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <AlertCircle className="text-amber-600 inline size-3.5" aria-label={es.match.doubtfulDate} />
      </TooltipTrigger>
      <TooltipContent>{es.match.doubtfulDate}</TooltipContent>
    </Tooltip>
  );
}

/** Fixture/results list: date & time (Montevideo), venue, home, score, away. */
export function MatchList({ matches, showTournament = false, highlightTeamId }: { matches: MatchSummary[]; showTournament?: boolean; highlightTeamId?: number }) {
  if (!matches.length) return <EmptyState />;
  return (
    <ul className="divide-border divide-y rounded-lg border">
      {matches.map((m) => (
        <li key={m.id} className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm sm:grid-cols-[9rem_1fr_auto_1fr]">
          <div className="text-muted-foreground col-span-3 flex flex-wrap items-center gap-x-2 text-xs sm:col-span-1 sm:block">
            <span>
              {formatMatchDate(m.kickoff)} {m.doubtfulDate && <DoubtfulDate />}
            </span>
            <span className="sm:block">
              {m.kickoff ? formatTime(m.kickoff) : ''} {m.venue ? `· ${m.venue}` : ''}
            </span>
            {showTournament && (
              <span className="sm:block">
                <TournamentLink tournament={m.tournament} withCategory={false} /> · {m.phase.name}
              </span>
            )}
          </div>
          <div className={cn('truncate text-right', highlightTeamId === m.home.id && 'font-semibold')}>
            <TeamLink team={m.home} />
          </div>
          <MatchLink match={m} className="flex min-w-16 items-center justify-center gap-1.5 rounded px-2 py-0.5 hover:no-underline">
            <Score match={m} />
            {m.walkOver && (
              <Badge variant="outline" className="px-1 text-[10px]">
                {es.match.walkOver}
              </Badge>
            )}
          </MatchLink>
          <div className={cn('truncate', highlightTeamId === m.away.id && 'font-semibold')}>
            <TeamLink team={m.away} />
          </div>
        </li>
      ))}
    </ul>
  );
}
