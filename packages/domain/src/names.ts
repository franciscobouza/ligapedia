/** Accent-, case- and whitespace-insensitive form used for identity keys, card matching and search. */
export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lowercase search form (same rules as normalizeName). */
export function searchForm(value: string): string {
  return normalizeName(value).toLowerCase();
}

export function slugify(value: string): string {
  return (
    searchForm(value)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'x'
  );
}

const PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'da', 'das', 'di', 'do', 'dos', 'van', 'von', 'el']);

/** Team-name tokens kept in capitals. Extend via data/overrides/display-names.yaml when needed. */
export const TEAM_ACRONYMS = new Set([
  'ORT', 'UGAB', 'ACJ', 'UM', 'UCU', 'UDE', 'FS', 'BBC', 'II', 'III', 'IV', 'AEBU', 'DNEP', 'CALI', 'CUBA', 'PW', 'SRS',
]);

function capitalizeWord(word: string): string {
  // Handle hyphens and apostrophes inside a word: D'ALESSANDRO → D'Alessandro, PEREZ-GOMEZ → Perez-Gomez.
  return word
    .toLowerCase()
    .replace(/(^|['’"“(-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

export function titleCase(value: string, keepUpper: (token: string) => boolean): string {
  const words = value.replace(/\s+/g, ' ').trim().split(' ');
  return words
    .map((w, i) => {
      if (!w) return w;
      if (keepUpper(w)) return w.toUpperCase();
      const lower = w.toLowerCase();
      if (i > 0 && PARTICLES.has(lower)) return lower;
      return capitalizeWord(w);
    })
    .join(' ');
}

/** "JUAN PABLO DE LOS SANTOS" → "Juan Pablo de los Santos" (no accents are invented). */
export function playerDisplayName(published: string): string {
  return titleCase(published, () => false);
}

/** "UNIVERSIDAD ORT" → "Universidad ORT"; dotted acronyms such as "C.U.B.A." are preserved. */
export function teamDisplayName(published: string, acronyms: ReadonlySet<string> = TEAM_ACRONYMS): string {
  return titleCase(published, (token) => {
    if (/\p{L}\./u.test(token)) return true; // C.U.B.A., A.E.B.U, P.W.
    return acronyms.has(normalizeName(token));
  });
}
