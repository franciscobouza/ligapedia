export const MONTEVIDEO_TZ = 'America/Montevideo';

const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: MONTEVIDEO_TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Offset (ms) of Montevideo wall-clock time from UTC at the given instant. */
function offsetMs(instant: number): number {
  const p = Object.fromEntries(fmt.formatToParts(new Date(instant)).map((x) => [x.type, x.value]));
  const wall = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!);
  return wall - Math.floor(instant / 1000) * 1000;
}

/**
 * Convert a Montevideo wall-clock time ("YYYY-MM-DD HH:MM[:SS]") to a UTC instant.
 * Uses the tz database, so the daylight-saving periods Uruguay observed until 2015 are honored.
 */
export function montevideoToUtc(local: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec((local ?? '').trim());
  if (!m) return null;
  const asUtc = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +(m[6] ?? 0));
  let t = asUtc - offsetMs(asUtc);
  t = asUtc - offsetMs(t);
  return new Date(t);
}

/** Calendar date (YYYY-MM-DD) in Montevideo for an instant. */
export function montevideoDate(instant: Date): string {
  const p = Object.fromEntries(fmt.formatToParts(instant).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
