/** Spanish (Uruguay) formatting; every date and time is shown in Montevideo time (specs/web-experience). */
export const TZ = 'America/Montevideo';
const LOCALE = 'es-UY';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  weekday: 'short',
});
const WEEKDAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface MvdParts {
  year: number;
  month: number; // 1–12
  day: number;
  hour: string;
  minute: string;
  weekday: number; // 0 = domingo
}

export function mvdParts(value: string | Date): MvdParts {
  const d = typeof value === 'string' ? new Date(value) : value;
  const p = Object.fromEntries(partsFmt.formatToParts(d).map((x) => [x.type, x.value]));
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: p.hour === '24' ? '00' : p.hour!,
    minute: p.minute!,
    weekday: WEEKDAY_EN.indexOf(p.weekday!),
  };
}

/** "2 oct 2026, 03:12" */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '';
  const p = mvdParts(value);
  return `${p.day} ${MONTHS[p.month - 1]} ${p.year}, ${p.hour}:${p.minute}`;
}

/** "sáb 16 may 2025" */
export function formatMatchDate(value: string | Date | null | undefined): string {
  if (!value) return 'Fecha a confirmar';
  const p = mvdParts(value);
  return `${WEEKDAYS[p.weekday]} ${p.day} ${MONTHS[p.month - 1]} ${p.year}`;
}

/** "16/05/2025" */
export function formatShortDate(value: string | Date | null | undefined): string {
  if (!value) return '';
  const p = mvdParts(value);
  return `${String(p.day).padStart(2, '0')}/${String(p.month).padStart(2, '0')}/${p.year}`;
}

/** "21:45" */
export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return '';
  const p = mvdParts(value);
  return `${p.hour}:${p.minute}`;
}

/** Calendar date "YYYY-MM-DD" (already a date) → "16 may 2025". */
export function formatDay(isoDate: string | null | undefined): string {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]} ${y}`;
}

const intFmt = new Intl.NumberFormat(LOCALE);
const decFmt = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pctFmt = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });

export const formatInt = (n: number | null | undefined) => (n === null || n === undefined ? '—' : intFmt.format(n));
/** 0.71 → "0,71" */
export const formatDecimal = (n: number | null | undefined) => (n === null || n === undefined ? '—' : decFmt.format(n));
/** 56.7 → "56,7%" (input already in percent) */
export const formatPercent = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${pctFmt.format(n)}%`);
/** 0.62 share → "62%" */
export const formatShare = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${pctFmt.format(n * 100)}%`);

export const categoryLabel = (c: 'M' | 'F') => (c === 'F' ? 'Femenino' : 'Masculino');
export const categoryParam = (c: 'M' | 'F') => (c === 'F' ? 'femenino' : 'masculino');
