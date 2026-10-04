import { normalizeName, TOURNAMENT_KINDS, type TournamentKind } from '@ligapedia/domain';

/** Spanish query parameter names shared by every list, statistics and comparison endpoint. */
export interface Filters {
  temporada?: number;
  desde?: number;
  hasta?: number;
  rama?: 'M' | 'F';
  torneo?: number;
  tipo?: TournamentKind;
  fase?: number;
  equipo?: number;
  rival?: number;
  jugador?: number;
  top?: number;
  min?: number;
  orden?: string;
  pagina?: number;
  fecha?: number;
  despues?: number;
  a?: number;
  b?: number;
  q?: string;
}

export type FilterName = keyof Filters;

export interface ParseContext {
  /** Existing season years. */
  seasons: ReadonlySet<number>;
  /** Accepted values for `orden` on this endpoint. */
  orders?: readonly string[];
}

export interface ParsedFilters {
  filters: Filters;
  /** "name=value" of every ignored parameter (returned in meta.ignoredFilters). */
  ignored: string[];
  /** Effective year range (temporada wins over desde/hasta). */
  from?: number;
  to?: number;
}

export const TOP_VALUES = [10, 25, 50, 100] as const;

const KIND_ALIASES: Record<string, TournamentKind> = {
  APERTURA: 'apertura',
  CLAUSURA: 'clausura',
  LIGA: 'liga',
  TORNEO: 'liga',
  ORO: 'oro',
  'COPA DE ORO': 'oro',
  PLAYOFF: 'oro',
  'PLAY-OFF': 'oro',
  PLATA: 'plata',
  'COPA DE PLATA': 'plata',
  ANUAL: 'anual',
  UNIVERSITARIO: 'anual',
  OTRO: 'otro',
};

const intOf = (v: string): number | undefined => (/^\d{1,9}$/.test(v) ? Number(v) : undefined);

/**
 * Parse filters forgivingly (spec search "Consistent and forgiving filters"): unknown or invalid
 * values are dropped and reported, never an error.
 */
export function parseFilters(
  query: Record<string, unknown>,
  allowed: readonly FilterName[],
  ctx: ParseContext,
): ParsedFilters {
  const filters: Filters = {};
  const ignored: string[] = [];
  const allow = new Set<string>(allowed);
  for (const [name, raw] of Object.entries(query)) {
    if (!allow.has(name)) continue;
    const value = Array.isArray(raw) ? String(raw[0] ?? '') : String(raw ?? '');
    if (value.trim() === '') continue;
    const v = value.trim();
    const bad = () => ignored.push(`${name}=${v}`);
    switch (name as FilterName) {
      case 'temporada': {
        const y = intOf(v);
        if (y !== undefined && ctx.seasons.has(y)) filters.temporada = y;
        else bad();
        break;
      }
      case 'desde':
      case 'hasta': {
        const y = intOf(v);
        if (y !== undefined && y >= 1990 && y <= 2100) filters[name as 'desde' | 'hasta'] = y;
        else bad();
        break;
      }
      case 'rama': {
        const n = normalizeName(v);
        if (n === 'M' || n === 'MASCULINO') filters.rama = 'M';
        else if (n === 'F' || n === 'FEMENINO') filters.rama = 'F';
        else bad();
        break;
      }
      case 'tipo': {
        const n = normalizeName(v);
        const k = (TOURNAMENT_KINDS as readonly string[]).includes(v.toLowerCase())
          ? (v.toLowerCase() as TournamentKind)
          : KIND_ALIASES[n];
        if (k) filters.tipo = k;
        else bad();
        break;
      }
      case 'top': {
        const t = intOf(v);
        if (t !== undefined && (TOP_VALUES as readonly number[]).includes(t)) filters.top = t;
        else bad();
        break;
      }
      case 'min': {
        const m = intOf(v);
        if (m !== undefined && m >= 1 && m <= 1000) filters.min = m;
        else bad();
        break;
      }
      case 'orden': {
        if (!ctx.orders || ctx.orders.includes(v)) filters.orden = v;
        else bad();
        break;
      }
      case 'q':
        filters.q = v.slice(0, 100);
        break;
      default: {
        const n = intOf(v);
        if (n !== undefined && n > 0) (filters as Record<string, number>)[name] = n;
        else bad();
      }
    }
  }
  let from = filters.desde;
  let to = filters.hasta;
  if (from !== undefined && to !== undefined && from > to) [from, to] = [to, from];
  if (filters.temporada !== undefined) from = to = filters.temporada;
  return { filters, ignored, from, to };
}
