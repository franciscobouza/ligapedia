/** The league's public JSON endpoints (see design "Context"). */
export const SOURCE_BASE_URL = 'https://ligauniversitaria.org.uy';

export type Endpoint = 'detallefechas' | 'posiciones_historicas';

export const SPORT_FUTSAL = 'FUTSAL';

/** The 12 per-match detail actions served by /detallefechas/api.php. */
export const DETAIL_ACTIONS = [
  'cargarDetallesPartido',
  'jueces',
  'Titulares Locatario',
  'Titulares Visitante',
  'CambiosLocatario',
  'CambiosVisitante',
  'GolesLocatario',
  'GolesVisitante',
  'Amonestados Locatario',
  'Amonestados Visitante',
  'Expulsados Locatario',
  'Expulsados Visitante',
] as const;
export type DetailAction = (typeof DETAIL_ACTIONS)[number];

export interface SourceRequest<A extends string = string> {
  endpoint: Endpoint;
  action: A;
  params: Record<string, string>;
}

/** Stable archive key: endpoint, action and parameters sorted by name. */
export function requestKey(req: SourceRequest): string {
  const params = Object.keys(req.params)
    .sort()
    .map((k) => `${k}=${req.params[k]}`)
    .join('&');
  return `${req.endpoint}:${req.action}${params ? `?${params}` : ''}`;
}

export function requestUrl(req: SourceRequest, baseUrl = SOURCE_BASE_URL): string {
  const qs = [`action=${encodeURIComponent(req.action)}`]
    .concat(
      Object.entries(req.params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`),
    )
    .join('&');
  return `${baseUrl}/${req.endpoint}/api.php?${qs}`;
}

// Request builders for the listing cascade, detail actions and standings.
export const req = {
  seasons: (endpoint: Endpoint = 'detallefechas'): SourceRequest<'cargarTemporadas'> => ({
    endpoint,
    action: 'cargarTemporadas',
    params: {},
  }),
  sports: (temporada: string): SourceRequest<'cargarDeportes'> => ({
    endpoint: 'detallefechas',
    action: 'cargarDeportes',
    params: { temporada },
  }),
  tournaments: (temporada: string, deporte = SPORT_FUTSAL): SourceRequest<'cargarTorneos'> => ({
    endpoint: 'detallefechas',
    action: 'cargarTorneos',
    params: { temporada, deporte },
  }),
  series: (temporada: string, torneo: string, deporte = SPORT_FUTSAL): SourceRequest<'cargarSeries'> => ({
    endpoint: 'detallefechas',
    action: 'cargarSeries',
    params: { temporada, deporte, torneo },
  }),
  rounds: (temporada: string, torneo: string, serie: string, deporte = SPORT_FUTSAL): SourceRequest<'cargarFechas'> => ({
    endpoint: 'detallefechas',
    action: 'cargarFechas',
    params: { temporada, deporte, torneo, serie },
  }),
  matches: (
    temporada: string,
    torneo: string,
    serie: string,
    fecha: string,
    deporte = SPORT_FUTSAL,
  ): SourceRequest<'cargarPartidos'> => ({
    endpoint: 'detallefechas',
    action: 'cargarPartidos',
    params: { temporada, deporte, torneo, serie, fecha },
  }),
  detail: <A extends DetailAction>(action: A, id: string): SourceRequest<A> => ({
    endpoint: 'detallefechas',
    action,
    params: { id },
  }),
  standings: (temporada: string, torneo: string, serie: string, deporte = SPORT_FUTSAL): SourceRequest<'cargarPosiciones'> => ({
    endpoint: 'posiciones_historicas',
    action: 'cargarPosiciones',
    params: { temporada, deporte, torneo, serie },
  }),
};
