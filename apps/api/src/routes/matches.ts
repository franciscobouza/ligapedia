import { Envelope, MatchDetail } from '@ligapedia/contracts';
import { SOURCE_BASE_URL } from '@ligapedia/domain';
import type { FastifyInstance } from 'fastify';
import { idParam, meta, type ApiContext } from '../context';
import { notFound } from '../errors';
import { matchColumns, matchJoins, playerRef, toMatchSummary, type MatchRow } from '../queries/common';

export async function matchRoutes(app: FastifyInstance, ctx: ApiContext): Promise<void> {
  const { sql } = ctx;

  app.get<{ Params: { id: string } }>('/api/v1/partidos/:id', { schema: { response: { 200: Envelope(MatchDetail) } } }, async (req) => {
    const id = idParam(req.params.id);
    const [row] = await sql<
      (MatchRow & {
        leg: number | null;
        match_number: number | null;
        inconsistent: boolean;
        observations: string | null;
        hu: number;
        au: number;
        home_team_id: number;
        away_team_id: number;
        kickoff_order: number;
      })[]
    >`
      SELECT ${matchColumns(sql)}, m.leg, m.match_number, m.inconsistent, m.observations,
             m.home_unattributed AS hu, m.away_unattributed AS au, m.home_team_id, m.away_team_id, m.kickoff_order
      FROM core.matches m ${matchJoins(sql)} WHERE m.id = ${id}`;
    if (!row) throw notFound('partido');

    const [lineups, goals, cards, subs, refs, h2h] = await Promise.all([
      sql<{ side: 'H' | 'A'; id: number; slug: string; name: string; shirt: number | null; captain: boolean }[]>`
        SELECT a.side, p.id, p.slug, p.display_name AS name, a.shirt, a.captain
        FROM core.appearances a JOIN core.players p ON p.id = a.player_id
        WHERE a.match_id = ${id} ORDER BY a.side, a.captain DESC, a.shirt NULLS LAST, a.seq`,
      sql<{ side: 'H' | 'A'; id: number | null; slug: string | null; name: string | null; minute: number | null; own_goal: boolean }[]>`
        SELECT g.side, p.id, p.slug, p.display_name AS name, g.minute, g.own_goal
        FROM core.goals g LEFT JOIN core.players p ON p.id = g.player_id
        WHERE g.match_id = ${id} ORDER BY g.side DESC, g.minute NULLS LAST, g.seq`,
      sql<{ side: 'H' | 'A'; color: 'Y' | 'R'; id: number | null; slug: string | null; name: string | null; raw_name: string; observations: string | null }[]>`
        SELECT c.side, c.color, p.id, p.slug, p.display_name AS name, c.raw_name, c.observations
        FROM core.cards c LEFT JOIN core.players p ON p.id = c.player_id
        WHERE c.match_id = ${id} ORDER BY c.side DESC, c.color, c.seq`,
      sql<{ side: 'H' | 'A'; player_out: string | null; player_in: string | null; minute: number | null }[]>`
        SELECT side, player_out, player_in, minute FROM core.substitutions WHERE match_id = ${id} ORDER BY side DESC, seq`,
      sql<{ role: string; name: string }[]>`SELECT role, name FROM core.officials WHERE match_id = ${id} ORDER BY seq`,
      sql<(MatchRow & { home_team_id: number })[]>`
        SELECT ${matchColumns(sql)}, m.home_team_id
        FROM core.matches m ${matchJoins(sql)}
        WHERE m.status = 'jugado' AND m.id <> ${id} AND m.kickoff_order < ${row.kickoff_order}
          AND ((m.home_team_id = ${row.home_team_id} AND m.away_team_id = ${row.away_team_id})
            OR (m.home_team_id = ${row.away_team_id} AND m.away_team_id = ${row.home_team_id}))
        ORDER BY m.kickoff_order DESC`,
    ]);

    let homeWins = 0;
    let awayWins = 0;
    let draws = 0;
    for (const m of h2h) {
      const thisHomeIsHome = m.home_team_id === row.home_team_id;
      const gHome = thisHomeIsHome ? m.m_hg! : m.m_ag!;
      const gAway = thisHomeIsHome ? m.m_ag! : m.m_hg!;
      if (gHome > gAway) homeWins++;
      else if (gAway > gHome) awayWins++;
      else draws++;
    }
    const summary = toMatchSummary(row);
    const winner =
      row.m_hg === null || row.m_ag === null || row.m_hg === row.m_ag ? null : row.m_hg > row.m_ag ? summary.home : summary.away;

    return {
      data: {
        match: summary,
        leg: row.leg,
        matchNumber: row.match_number,
        inconsistent: row.inconsistent,
        observations: row.observations,
        lineups: {
          home: lineups.filter((l) => l.side === 'H').map((l) => ({ player: playerRef(l.id, l.slug, l.name), shirt: l.shirt, captain: l.captain })),
          away: lineups.filter((l) => l.side === 'A').map((l) => ({ player: playerRef(l.id, l.slug, l.name), shirt: l.shirt, captain: l.captain })),
        },
        goals: goals.map((g) => ({
          side: g.side,
          player: g.id !== null ? playerRef(g.id, g.slug!, g.name!) : null,
          minute: g.minute,
          ownGoal: g.own_goal,
        })),
        unattributed: { home: row.hu, away: row.au },
        cards: cards.map((c) => ({
          side: c.side,
          color: c.color,
          player: c.id !== null ? playerRef(c.id, c.slug!, c.name!) : null,
          name: c.name ?? c.raw_name,
          observations: c.observations,
        })),
        substitutions: subs.map((s) => ({ side: s.side, playerOut: s.player_out, playerIn: s.player_in, minute: s.minute })),
        referees: refs,
        headToHead: { matches: h2h.length, homeWins, awayWins, draws, previous: h2h.slice(0, 5).map(toMatchSummary) },
        officialUrl: `${SOURCE_BASE_URL}/detallefechas/detallePartido.html?id=${id}`,
        winner,
      },
      meta: meta(ctx),
    };
  });
}
