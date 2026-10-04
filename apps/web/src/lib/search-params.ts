import type { Kind } from '@ligapedia/contracts';
import type { Params } from './api';

/** URL search state shared by list, statistics and comparison pages (Spanish names, specs/search). */
export interface FilterSearch {
  temporada?: number;
  desde?: number;
  hasta?: number;
  rama?: 'masculino' | 'femenino';
  tipo?: Kind;
  torneo?: number;
  equipo?: number;
  rival?: number;
  top?: number;
  min?: number;
  orden?: string;
  pagina?: number;
  fecha?: number;
  despues?: number;
  a?: number;
  b?: number;
  tab?: string;
  q?: string;
}

const KINDS: readonly Kind[] = ['apertura', 'clausura', 'liga', 'oro', 'plata', 'anual', 'otro'];
const INT_KEYS = ['temporada', 'desde', 'hasta', 'torneo', 'equipo', 'rival', 'top', 'min', 'pagina', 'fecha', 'despues', 'a', 'b'] as const;

/** Forgiving parse: invalid values are dropped (the API reports them as ignored filters). */
export function parseSearch(raw: Record<string, unknown>): FilterSearch {
  const out: FilterSearch = {};
  for (const key of INT_KEYS) {
    const v = raw[key];
    const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d{1,9}$/.test(v) ? Number(v) : undefined;
    if (n !== undefined && Number.isInteger(n) && n > 0) out[key] = n;
  }
  if (raw.rama === 'masculino' || raw.rama === 'femenino') out.rama = raw.rama;
  if (typeof raw.tipo === 'string' && (KINDS as readonly string[]).includes(raw.tipo)) out.tipo = raw.tipo as Kind;
  if (typeof raw.orden === 'string' && /^[a-z-]{1,40}$/.test(raw.orden)) out.orden = raw.orden;
  if (typeof raw.tab === 'string' && /^[a-z-]{1,30}$/.test(raw.tab)) out.tab = raw.tab;
  if (typeof raw.q === 'string') out.q = raw.q.slice(0, 100);
  return out;
}

export function pick<K extends keyof FilterSearch>(s: FilterSearch, keys: readonly K[]): Params {
  const out: Params = {};
  for (const k of keys) if (s[k] !== undefined) out[k] = s[k] as string | number;
  return out;
}

/** Entity route param "123-some-slug" → 123 (NaN when invalid). */
export function idFrom(param: string): number {
  const m = /^(\d{1,9})(?:-|$)/.exec(param);
  return m ? Number(m[1]) : Number.NaN;
}

export const entityParam = (e: { id: number; slug: string }) => `${e.id}-${e.slug}`;
