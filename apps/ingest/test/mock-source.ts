import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { requestKey, type Endpoint, type SourceRequest } from '@ligapedia/domain';
import { recordedResponses } from '../../../packages/domain/test/fixtures';

export interface MockResponse {
  status: number;
  body: string;
}

/**
 * A local stand-in for the league's endpoints. Responses come from the recorded fixtures,
 * overridable per request key; unknown keys answer 404. `fail` injects failures.
 */
export class MockSource {
  readonly responses = new Map<string, MockResponse>();
  readonly hits: string[] = [];
  fail: (key: string) => MockResponse | undefined = () => undefined;
  private server?: Server;
  baseUrl = '';

  constructor(options: { fixtures?: boolean } = {}) {
    if (options.fixtures !== false) {
      for (const r of recordedResponses()) this.responses.set(requestKey(r), { status: r.status, body: r.body });
    }
  }

  set(req: SourceRequest, body: unknown, status = 200): this {
    this.responses.set(requestKey(req), { status, body: typeof body === 'string' ? body : JSON.stringify(body) });
    return this;
  }

  async start(): Promise<string> {
    this.server = createServer((rq, rs) => {
      const url = new URL(rq.url!, 'http://mock');
      const endpoint = url.pathname.split('/')[1] as Endpoint;
      const params: Record<string, string> = {};
      let action = '';
      for (const [k, v] of url.searchParams) {
        if (k === 'action') action = v;
        else params[k] = v;
      }
      const key = requestKey({ endpoint, action, params });
      this.hits.push(key);
      const res = this.fail(key) ?? this.responses.get(key) ?? { status: 404, body: 'not found' };
      rs.writeHead(res.status, { 'content-type': 'application/json' }).end(res.body);
    });
    await new Promise<void>((ok) => this.server!.listen(0, '127.0.0.1', ok));
    this.baseUrl = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
    return this.baseUrl;
  }

  async stop(): Promise<void> {
    await new Promise<void>((ok) => (this.server ? this.server.close(() => ok()) : ok()));
  }
}

/** Restrict the recorded fixtures to a one-season source: 2025 (code 112) Apertura tournament. */
export function apertura2025Source(): MockSource {
  const m = new MockSource();
  m.set({ endpoint: 'detallefechas', action: 'cargarTemporadas', params: {} }, [{ codigo: '112' }]);
  m.set({ endpoint: 'detallefechas', action: 'cargarDeportes', params: { temporada: '112' } }, [
    { nombre: 'FÚTBOL' },
    { nombre: 'FUTSAL' },
  ]);
  m.set({ endpoint: 'detallefechas', action: 'cargarSeries', params: { temporada: '112', deporte: 'FUTSAL', torneo: 'FUTSAL' } }, [
    { nombre: 'APERTURA' },
    { nombre: 'APERTURA SERIE 1' },
    { nombre: 'APERTURA - SERIE 2' },
    { nombre: 'FINAL DEL APERTURA' },
  ]);
  return m;
}

import type { Sql } from '@ligapedia/db';
import { archiveResponse } from '../src/archive';

/** Put every recorded fixture response into raw.responses (as a crawl would). */
export async function seedArchiveFromFixtures(sql: Sql): Promise<number> {
  let n = 0;
  for (const r of recordedResponses()) {
    if (r.status !== 200 && !(r.action === 'jueces' && r.body === '')) continue;
    await archiveResponse(sql, r, r.status, r.body);
    n++;
  }
  return n;
}
