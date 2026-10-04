import type { MatchSummary, PlayerRef, TeamRef, TournamentRef } from '@ligapedia/contracts';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { entityParam } from '@/lib/search-params';
import { categoryLabel } from '@/lib/format';
import { cn } from '@/lib/utils';

const linkCls = 'hover:text-primary underline-offset-4 hover:underline focus-visible:underline';

export function TeamLink({ team, className, children }: { team: TeamRef; className?: string; children?: ReactNode }) {
  return (
    <Link to="/equipos/$equipo" params={{ equipo: entityParam(team) }} className={cn(linkCls, className)}>
      {children ?? team.name}
    </Link>
  );
}

export function PlayerLink({ player, className, children }: { player: PlayerRef; className?: string; children?: ReactNode }) {
  return (
    <Link to="/jugadores/$jugador" params={{ jugador: entityParam(player) }} className={cn(linkCls, className)}>
      {children ?? player.name}
    </Link>
  );
}

export function tournamentLabel(t: TournamentRef, withCategory = true): string {
  return `${t.name} ${t.seasonYear}${withCategory ? ` · ${categoryLabel(t.category)}` : ''}`;
}

export function TournamentLink({ tournament, className, withCategory = true }: { tournament: TournamentRef; className?: string; withCategory?: boolean }) {
  return (
    <Link to="/torneos/$torneo" params={{ torneo: entityParam(tournament) }} className={cn(linkCls, className)}>
      {tournamentLabel(tournament, withCategory)}
    </Link>
  );
}

export function MatchLink({ match, className, children }: { match: Pick<MatchSummary, 'id'>; className?: string; children: ReactNode }) {
  return (
    <Link to="/partidos/$id" params={{ id: String(match.id) }} className={cn(linkCls, className)}>
      {children}
    </Link>
  );
}
