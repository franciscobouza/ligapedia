import type { Sql } from '@ligapedia/db';

export interface DatasetInfo {
  version: number;
  publishedAt: Date | null;
}

/**
 * Tracks the published dataset version. Caches are keyed by it, so a publish (NOTIFY
 * dataset_published) or the 30 s poll fallback invalidates every cached response (design D9).
 */
export class DatasetState {
  current: DatasetInfo = { version: 0, publishedAt: null };
  private timer?: NodeJS.Timeout;
  private unlisten?: () => Promise<void>;
  private readonly listeners = new Set<(info: DatasetInfo) => void>();

  constructor(private readonly sql: Sql) {}

  async refresh(): Promise<DatasetInfo> {
    const [row] = await this.sql<{ version: number; published_at: Date | null }[]>`
      SELECT version, published_at FROM meta.dataset WHERE id = 1`;
    const next = { version: row?.version ?? 0, publishedAt: row?.published_at ?? null };
    const changed = next.version !== this.current.version;
    this.current = next;
    if (changed) for (const l of this.listeners) l(next);
    return next;
  }

  onChange(listener: (info: DatasetInfo) => void): void {
    this.listeners.add(listener);
  }

  async start(pollMs = 30_000): Promise<void> {
    await this.refresh();
    try {
      const sub = await this.sql.listen('dataset_published', () => void this.refresh().catch(() => {}));
      this.unlisten = () => sub.unlisten();
    } catch {
      // LISTEN unavailable (e.g. a pooler): the poll below still picks up new versions.
    }
    this.timer = setInterval(() => void this.refresh().catch(() => {}), pollMs);
    this.timer.unref();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.unlisten?.();
  }
}
