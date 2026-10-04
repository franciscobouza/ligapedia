import { Type, type Static, type TSchema } from 'typebox';
import { Compile } from 'typebox/compile';

// Shapes of the league's JSON responses. Extra fields are tolerated; missing or mistyped
// fields are a hard failure for the item (design D7: a silent source redesign must never publish).

const Str = Type.String();
const NStr = Type.Union([Type.String(), Type.Null()]);

export const SeasonRow = Type.Object({ codigo: Str });
export const NameRow = Type.Object({ nombre: Str });
export const RoundRow = Type.Object({ fecha: Str });
export const MatchListRow = Type.Object({
  Fecha: Str,
  Fecha_Hora: NStr,
  Cancha: NStr,
  Locatario: Str,
  GL: NStr,
  Visitante: Str,
  GV: NStr,
  ID: Str,
});
export const MatchDetailRow = Type.Object({
  nro_partido: NStr,
  temporada: NStr,
  deporte: NStr,
  torneo: NStr,
  categoria: NStr,
  rueda: NStr,
  Divisional: NStr,
  Cancha: NStr,
  Fecha_Inicio: NStr,
  Fecha_fin: NStr,
  Locatario: Str,
  goles_locatario: NStr,
  puntos_locatario: NStr,
  Visitante: Str,
  goles_visitante: NStr,
  puntos_visitante: NStr,
  walk_over: NStr,
  observaciones: NStr,
});
export const RefereeRow = Type.Object({ Cargo: NStr, Nombre: NStr });
export const LineupRow = Type.Object({
  carne: Str,
  Nombre: Str,
  camiseta: NStr,
  Capitan: Type.Optional(NStr),
});
export const SubstitutionRow = Type.Object({
  Jug_Sale: NStr,
  Jug_Entra: NStr,
  minutos: NStr,
});
export const GoalRow = Type.Object({
  carne: Str,
  Nombre: Str,
  minutos: NStr,
  EnContra: Type.Optional(NStr),
});
export const YellowRow = Type.Object({ Nombre: Str });
export const RedRow = Type.Object({ Nombre: Str, observaciones: Type.Optional(NStr) });
export const StandingRow = Type.Object({
  Institucion: Str,
  PJ: Str,
  PG: Str,
  PE: Str,
  PP: Str,
  GF: Str,
  GC: Str,
  Puntos: Str,
});

export type SeasonRow = Static<typeof SeasonRow>;
export type NameRow = Static<typeof NameRow>;
export type RoundRow = Static<typeof RoundRow>;
export type MatchListRow = Static<typeof MatchListRow>;
export type MatchDetailRow = Static<typeof MatchDetailRow>;
export type RefereeRow = Static<typeof RefereeRow>;
export type LineupRow = Static<typeof LineupRow>;
export type SubstitutionRow = Static<typeof SubstitutionRow>;
export type GoalRow = Static<typeof GoalRow>;
export type YellowRow = Static<typeof YellowRow>;
export type RedRow = Static<typeof RedRow>;
export type StandingRow = Static<typeof StandingRow>;

export const ROW_SCHEMAS = {
  cargarTemporadas: SeasonRow,
  cargarDeportes: NameRow,
  cargarTorneos: NameRow,
  cargarSeries: NameRow,
  cargarFechas: RoundRow,
  cargarPartidos: MatchListRow,
  cargarDetallesPartido: MatchDetailRow,
  jueces: RefereeRow,
  'Titulares Locatario': LineupRow,
  'Titulares Visitante': LineupRow,
  CambiosLocatario: SubstitutionRow,
  CambiosVisitante: SubstitutionRow,
  GolesLocatario: GoalRow,
  GolesVisitante: GoalRow,
  'Amonestados Locatario': YellowRow,
  'Amonestados Visitante': YellowRow,
  'Expulsados Locatario': RedRow,
  'Expulsados Visitante': RedRow,
  cargarPosiciones: StandingRow,
} as const satisfies Record<string, TSchema>;

export type SourceAction = keyof typeof ROW_SCHEMAS;
export type RowOf<A extends SourceAction> = Static<(typeof ROW_SCHEMAS)[A]>;

const validators = Object.fromEntries(
  Object.entries(ROW_SCHEMAS).map(([action, schema]) => [action, Compile(schema)]),
) as { [A in SourceAction]: ReturnType<typeof Compile<(typeof ROW_SCHEMAS)[A]>> };

export type ParseResult<T> =
  | { ok: true; rows: T[]; empty: boolean }
  | { ok: false; retryable: boolean; reason: string };

export function isSourceAction(action: string): action is SourceAction {
  return Object.hasOwn(ROW_SCHEMAS, action);
}

/**
 * Interpret one source response.
 *  - HTTP 200 with an empty body or `{"error": …}` → no records.
 *  - `jueces` answered with HTTP 500 and an empty body → no records (source quirk; not retried).
 *  - Other HTTP errors → retryable failure; unexpected JSON shapes → non-retryable failure.
 */
export function parseSourceResponse<A extends SourceAction>(
  action: A,
  status: number,
  body: string,
): ParseResult<RowOf<A>> {
  const blank = body.trim() === '';
  if (status === 500 && blank && action === 'jueces') return { ok: true, rows: [], empty: true };
  if (status !== 200) return { ok: false, retryable: true, reason: `HTTP ${status}` };
  if (blank) return { ok: true, rows: [], empty: true };
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return { ok: false, retryable: true, reason: 'invalid JSON' };
  }
  if (value && typeof value === 'object' && !Array.isArray(value) && 'error' in value) {
    return { ok: true, rows: [], empty: true };
  }
  if (!Array.isArray(value)) return { ok: false, retryable: false, reason: 'expected a JSON array' };
  const validator = validators[action];
  for (let i = 0; i < value.length; i++) {
    if (!validator.Check(value[i])) {
      const first = [...validator.Errors(value[i])][0];
      return {
        ok: false,
        retryable: false,
        reason: `row ${i} does not match ${action}: ${first ? `${first.instancePath} ${first.message}` : 'invalid'}`,
      };
    }
  }
  return { ok: true, rows: value as RowOf<A>[], empty: value.length === 0 };
}
