import {
  isSourceAction,
  parseSourceResponse,
  requestKey,
  requestUrl,
  SOURCE_BASE_URL,
  type ParseResult,
  type SourceRequest,
} from '@ligapedia/domain';

export interface SourceClientOptions {
  baseUrl?: string;
  /** Maximum requests in flight (default 4). */
  concurrency?: number;
  timeoutMs?: number;
  /** Total attempts per request, including the first (default 4). */
  attempts?: number;
  /** Base delay for exponential backoff (default 1000 ms). */
  backoffMs?: number;
  /** Consecutive failed requests that open the circuit (default 20). */
  circuitBreakerThreshold?: number;
  userAgent: string;
  fetchImpl?: typeof fetch;
}

export interface SourceResponse {
  req: SourceRequest;
  key: string;
  status: number;
  body: string;
  parsed: ParseResult<unknown>;
  attempts: number;
}

export class CircuitOpenError extends Error {
  constructor(threshold: number) {
    super(`Source circuit open after ${threshold} consecutive failures`);
  }
}

export function userAgent(version: string, siteUrl: string | undefined, contact: string | undefined): string {
  return `Ligapedia/${version} (+${siteUrl || 'https://ligapedia.local'}; ${contact || 'no contact configured'})`;
}

/** Concurrency-limited, retrying client for the league's endpoints (design D7). */
export class SourceClient {
  private readonly opts: Required<Omit<SourceClientOptions, 'fetchImpl'>> & { fetchImpl: typeof fetch };
  private active = 0;
  private readonly queue: Array<() => void> = [];
  private consecutiveFailures = 0;
  /** Highest number of simultaneous requests observed (for tests and logs). */
  maxObservedInFlight = 0;
  requests = 0;

  constructor(options: SourceClientOptions) {
    this.opts = {
      baseUrl: options.baseUrl ?? SOURCE_BASE_URL,
      concurrency: options.concurrency ?? 4,
      timeoutMs: options.timeoutMs ?? 30_000,
      attempts: options.attempts ?? 4,
      backoffMs: options.backoffMs ?? 1000,
      circuitBreakerThreshold: options.circuitBreakerThreshold ?? 20,
      userAgent: options.userAgent,
      fetchImpl: options.fetchImpl ?? fetch,
    };
  }

  get circuitOpen(): boolean {
    return this.consecutiveFailures >= this.opts.circuitBreakerThreshold;
  }

  private async acquire(): Promise<void> {
    if (this.active < this.opts.concurrency) {
      this.active++;
    } else {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.maxObservedInFlight = Math.max(this.maxObservedInFlight, this.active);
  }

  private release(): void {
    const next = this.queue.shift();
    if (next) next(); // hand the slot over without decrementing
    else this.active--;
  }

  private async once(req: SourceRequest): Promise<{ status: number; body: string }> {
    await this.acquire();
    try {
      this.requests++;
      const res = await this.opts.fetchImpl(requestUrl(req, this.opts.baseUrl), {
        headers: { 'user-agent': this.opts.userAgent, accept: 'application/json' },
        signal: AbortSignal.timeout(this.opts.timeoutMs),
      });
      return { status: res.status, body: await res.text() };
    } finally {
      this.release();
    }
  }

  /**
   * Fetch and interpret one request. Retries network errors, timeouts, 5xx and invalid JSON with
   * exponential backoff and jitter; never retries well-formed "no records" answers or shape mismatches.
   */
  async fetch(req: SourceRequest): Promise<SourceResponse> {
    if (this.circuitOpen) throw new CircuitOpenError(this.opts.circuitBreakerThreshold);
    const key = requestKey(req);
    let last: SourceResponse | undefined;
    for (let attempt = 1; attempt <= this.opts.attempts; attempt++) {
      let status = 0;
      let body = '';
      let parsed: ParseResult<unknown>;
      try {
        ({ status, body } = await this.once(req));
        parsed = isSourceAction(req.action)
          ? parseSourceResponse(req.action, status, body)
          : { ok: false, retryable: false, reason: `unknown action ${req.action}` };
      } catch (err) {
        parsed = { ok: false, retryable: true, reason: err instanceof Error ? err.message : String(err) };
      }
      last = { req, key, status, body, parsed, attempts: attempt };
      if (parsed.ok || !parsed.retryable) break;
      if (attempt < this.opts.attempts) {
        const delay = this.opts.backoffMs * 2 ** (attempt - 1) * (0.75 + Math.random() * 0.5);
        await new Promise((ok) => setTimeout(ok, delay));
      }
    }
    if (last!.parsed.ok) this.consecutiveFailures = 0;
    else this.consecutiveFailures++;
    return last!;
  }
}
