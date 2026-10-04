import type { Meta } from '@ligapedia/contracts';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface ApiResponse<T> {
  data: T;
  meta: Meta;
}

export type Params = Record<string, string | number | boolean | null | undefined>;

export function queryString(params: Params = {}): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== false);
  if (!entries.length) return '';
  return '?' + new URLSearchParams(entries.sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, String(v)])).toString();
}

declare global {
  interface Window {
    /** Responses started by public/boot.js before the bundle loaded (keyed by URL). */
    __lpPrefetch?: Record<string, Promise<unknown>>;
  }
}

/** Take (once) a response that public/boot.js started early for this URL. */
function takePrefetched<T>(url: string): Promise<ApiResponse<T>> | undefined {
  const cache = typeof window !== 'undefined' ? window.__lpPrefetch : undefined;
  const hit = cache?.[url];
  if (!hit) return undefined;
  delete cache![url];
  return hit as Promise<ApiResponse<T>>;
}

/** GET /api/v1/{path} → typed envelope. */
export async function apiGet<T>(path: string, params?: Params, signal?: AbortSignal): Promise<ApiResponse<T>> {
  const url = `/api/v1/${path}${queryString(params)}`;
  const early = takePrefetched<T>(url);
  if (early) {
    try {
      return await early;
    } catch {
      // fall through to a normal request (which reports the error properly)
    }
  }
  const res = await fetch(url, { signal, headers: { accept: 'application/json' } });
  if (!res.ok) {
    let message = 'Error';
    try {
      message = ((await res.json()) as { message?: string }).message ?? message;
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as ApiResponse<T>;
}
