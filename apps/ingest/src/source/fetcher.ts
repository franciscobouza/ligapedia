import type { Sql } from '@ligapedia/db';
import {
  isSourceAction,
  parseSourceResponse,
  requestKey,
  type RowOf,
  type SourceAction,
  type SourceRequest,
} from '@ligapedia/domain';
import { archiveResponse, getArchived } from '../archive';
import type { SourceClient } from './client';

export interface FetchFailure {
  key: string;
  reason: string;
}

export interface FetchStats {
  /** Requests sent to the source (after reuse). */
  requests: number;
  /** Responses served from the archive instead of the network (backfill resume). */
  reused: number;
  inserted: number;
  changed: number;
  failed: FetchFailure[];
}

export class InterruptedError extends Error {}

export interface FetcherOptions {
  /** Keys whose archived body may be reused without a network request. */
  reuseKeys?: Set<string>;
  /** Test hook: throw InterruptedError after this many network requests. */
  stopAfter?: number;
  /** Called every `progressEvery` network requests (default 500). */
  onProgress?: (stats: FetchStats) => void;
  progressEvery?: number;
}

/** Fetches through the polite client, archives every good answer, and records failures. */
export class ArchivingFetcher {
  readonly stats: FetchStats = { requests: 0, reused: 0, inserted: 0, changed: 0, failed: [] };
  readonly changedKeys = new Set<string>();
  /** Network requests that finished (success or failure). */
  completed = 0;

  constructor(
    private readonly sql: Sql,
    private readonly client: SourceClient,
    private readonly options: FetcherOptions = {},
  ) {}

  async get<A extends SourceAction>(req: SourceRequest<A>): Promise<RowOf<A>[] | null> {
    const key = requestKey(req);
    if (this.options.reuseKeys?.has(key)) {
      const archived = await getArchived(this.sql, key);
      if (archived) {
        const parsed = parseSourceResponse(req.action, archived.status, archived.body);
        if (parsed.ok) {
          this.stats.reused++;
          return parsed.rows;
        }
      }
    }
    if (this.options.stopAfter !== undefined && this.stats.requests >= this.options.stopAfter) {
      throw new InterruptedError(`stopped after ${this.stats.requests} requests`);
    }
    this.stats.requests++;
    if (!isSourceAction(req.action)) throw new Error(`Unknown source action ${req.action}`);
    const res = await this.client.fetch(req);
    this.completed++;
    if (this.options.onProgress && this.completed % (this.options.progressEvery ?? 500) === 0) {
      this.options.onProgress(this.stats);
    }
    if (!res.parsed.ok) {
      this.stats.failed.push({ key, reason: res.parsed.reason });
      return null;
    }
    const up = await archiveResponse(this.sql, req, res.status, res.body);
    if (up.inserted) this.stats.inserted++;
    if (up.changed) {
      this.stats.changed++;
      this.changedKeys.add(key);
    }
    return res.parsed.rows as RowOf<A>[];
  }

  failureRate(): number {
    return this.stats.requests === 0 ? 0 : this.stats.failed.length / this.stats.requests;
  }
}
