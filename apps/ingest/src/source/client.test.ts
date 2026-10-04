import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { req } from '@ligapedia/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { CircuitOpenError, SourceClient } from './client';

let server: Server | undefined;
afterEach(() => new Promise<void>((ok) => (server ? server.close(() => ok()) : ok())));

async function serve(handler: (url: URL, n: number) => Promise<[number, string]> | [number, string]): Promise<string> {
  let n = 0;
  server = createServer(async (rq, rs) => {
    const [status, body] = await handler(new URL(rq.url!, 'http://x'), ++n);
    rs.writeHead(status, { 'content-type': 'application/json' }).end(body);
  });
  await new Promise<void>((ok) => server!.listen(0, '127.0.0.1', ok));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const client = (baseUrl: string, extra: Partial<ConstructorParameters<typeof SourceClient>[0]> = {}) =>
  new SourceClient({ baseUrl, userAgent: 'test', backoffMs: 5, ...extra });

describe('SourceClient', () => {
  it('retries a 503 and then succeeds', async () => {
    const base = await serve((_u, n) => (n === 1 ? [503, 'busy'] : [200, '[{"fecha":"1"}]']));
    const res = await client(base).fetch(req.rounds('112', 'FUTSAL', 'APERTURA'));
    expect(res.parsed).toMatchObject({ ok: true, rows: [{ fecha: '1' }] });
    expect(res.attempts).toBe(2);
  });

  it('never has more than 4 requests in flight', async () => {
    let inFlight = 0;
    let max = 0;
    const base = await serve(async () => {
      max = Math.max(max, ++inFlight);
      await new Promise((ok) => setTimeout(ok, 20));
      inFlight--;
      return [200, '[]'];
    });
    const c = client(base);
    await Promise.all(Array.from({ length: 20 }, (_, i) => c.fetch(req.detail('GolesLocatario', String(i)))));
    expect(max).toBeLessThanOrEqual(4);
    expect(c.maxObservedInFlight).toBe(4);
    expect(c.requests).toBe(20);
  });

  it('counts an error body as a successful empty answer without retrying', async () => {
    const base = await serve(() => [200, '{"error":"No se encontraron amonestados"}']);
    const res = await client(base).fetch(req.detail('Amonestados Locatario', '92923'));
    expect(res.parsed).toEqual({ ok: true, rows: [], empty: true });
    expect(res.attempts).toBe(1);
  });

  it('does not retry jueces HTTP 500 with an empty body', async () => {
    const base = await serve(() => [500, '']);
    const res = await client(base).fetch(req.detail('jueces', '92923'));
    expect(res.parsed).toMatchObject({ ok: true, rows: [] });
    expect(res.attempts).toBe(1);
  });

  it('gives up after the attempt limit and opens the circuit after repeated failures', async () => {
    const base = await serve(() => [503, '']);
    const c = client(base, { attempts: 2, circuitBreakerThreshold: 3 });
    for (let i = 0; i < 3; i++) {
      const res = await c.fetch(req.detail('GolesLocatario', String(i)));
      expect(res.parsed.ok).toBe(false);
      expect(res.attempts).toBe(2);
    }
    await expect(c.fetch(req.detail('GolesLocatario', '9'))).rejects.toBeInstanceOf(CircuitOpenError);
  });

  it('sends the configured User-Agent', async () => {
    let ua = '';
    server = createServer((rq, rs) => {
      ua = rq.headers['user-agent'] ?? '';
      rs.end('[]');
    });
    await new Promise<void>((ok) => server!.listen(0, '127.0.0.1', ok));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    await new SourceClient({ baseUrl: base, userAgent: 'Ligapedia/0.1 (+https://x; c@x)' }).fetch(req.seasons());
    expect(ua).toBe('Ligapedia/0.1 (+https://x; c@x)');
  });
});
