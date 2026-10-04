import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { requestKey, type SourceRequest } from '../src/source/endpoints';

export interface RecordedResponse extends SourceRequest {
  status: number;
  body: string;
}

let cache: RecordedResponse[] | undefined;

/** Real source responses recorded by scripts/record-fixtures.ts. */
export function recordedResponses(): RecordedResponse[] {
  cache ??= JSON.parse(
    readFileSync(fileURLToPath(new URL('./fixtures/responses.json', import.meta.url)), 'utf8'),
  ) as RecordedResponse[];
  return cache;
}

export function recorded(req: SourceRequest): RecordedResponse {
  const key = requestKey(req);
  const hit = recordedResponses().find((r) => requestKey(r) === key);
  if (!hit) throw new Error(`No fixture for ${key}`);
  return hit;
}

import type { MatchSource } from '../src/events';
import { req } from '../src/source/endpoints';
import { parseSourceResponse, type RowOf, type SourceAction } from '../src/source/schemas';

function rows<A extends SourceAction>(action: A, r: RecordedResponse): RowOf<A>[] {
  const parsed = parseSourceResponse(action, r.status, r.body);
  if (!parsed.ok) throw new Error(`fixture ${action} failed: ${parsed.reason}`);
  return parsed.rows;
}

/** Assemble a MatchSource for a recorded match (listing row + all 12 detail actions). */
export function matchSourceFromFixtures(id: string, seasonYear: number): MatchSource {
  const listingRow = recordedResponses()
    .filter((r) => r.action === 'cargarPartidos')
    .flatMap((r) => rows('cargarPartidos', r))
    .find((m) => m.ID === id);
  if (!listingRow) throw new Error(`no listing row for match ${id}`);
  const d = <A extends SourceAction & (typeof import('../src/source/endpoints').DETAIL_ACTIONS)[number]>(action: A) =>
    rows(action, recorded(req.detail(action, id)));
  return {
    listing: listingRow,
    detail: d('cargarDetallesPartido')[0] ?? null,
    lineups: { H: d('Titulares Locatario'), A: d('Titulares Visitante') },
    goals: { H: d('GolesLocatario'), A: d('GolesVisitante') },
    yellows: { H: d('Amonestados Locatario'), A: d('Amonestados Visitante') },
    reds: { H: d('Expulsados Locatario'), A: d('Expulsados Visitante') },
    substitutions: { H: d('CambiosLocatario'), A: d('CambiosVisitante') },
    referees: d('jueces'),
    seasonYear,
  };
}
