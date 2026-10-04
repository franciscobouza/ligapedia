import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { LRUCache } from 'lru-cache';
import type { DatasetState } from './dataset';

interface CachedResponse {
  body: string;
  etag: string;
}

/** Canonical cache key: path + query parameters sorted by name. */
export function canonicalUrl(url: string): string {
  const u = new URL(url, 'http://x');
  const params = [...u.searchParams.entries()].filter(([, v]) => v !== '').sort(([a], [b]) => a.localeCompare(b));
  return u.pathname + (params.length ? `?${new URLSearchParams(params).toString()}` : '');
}

export function etagFor(version: number, key: string): string {
  return `"v${version}-${createHash('sha1').update(key).digest('base64url').slice(0, 16)}"`;
}

declare module 'fastify' {
  interface FastifyRequest {
    cacheKey?: string;
  }
}

/**
 * Response cache for GET /api/v1/*: an LRU of serialized bodies keyed by dataset version and
 * canonical URL, strong ETags derived from the same, `Cache-Control: no-cache` so browsers
 * always revalidate (cheap 304s) and receive new data right after a publish (design D9).
 */
export function registerResponseCache(app: FastifyInstance, dataset: DatasetState, maxEntries = 20_000): LRUCache<string, CachedResponse> {
  const cache = new LRUCache<string, CachedResponse>({ max: maxEntries, maxSize: 256 * 1024 * 1024, sizeCalculation: (v) => v.body.length + 64 });
  dataset.onChange(() => cache.clear());

  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.method !== 'GET' || !req.url.startsWith('/api/v1/')) return;
    const version = dataset.current.version;
    const key = `${version}:${canonicalUrl(req.url)}`;
    req.cacheKey = key;
    const etag = etagFor(version, key);
    reply.header('etag', etag).header('cache-control', 'no-cache');
    if (req.headers['if-none-match'] === etag) {
      return reply.code(304).send();
    }
    const hit = cache.get(key);
    if (hit) {
      reply.header('x-cache', 'hit').type('application/json; charset=utf-8');
      return reply.send(hit.body);
    }
  });

  app.addHook('onSend', async (req, reply, payload) => {
    if (req.cacheKey && reply.statusCode === 200 && typeof payload === 'string' && reply.getHeader('x-cache') !== 'hit') {
      cache.set(req.cacheKey, { body: payload, etag: String(reply.getHeader('etag')) });
      reply.header('x-cache', 'miss');
    }
    return payload;
  });
  return cache;
}
