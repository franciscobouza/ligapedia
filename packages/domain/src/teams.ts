import { normalizeName } from './names';
import type { TeamAliasOverride } from './overrides';
import type { Category } from './tournaments';

export interface TeamResolver {
  /** Identity key: category + normalized canonical name. */
  key(publishedName: string, category: Category): string;
  /** Normalized canonical name for a published name. */
  canonical(publishedName: string, category: Category): string;
}

/** Teams are identified by normalized published name within a category; aliases merge spellings. */
export function createTeamResolver(aliases: TeamAliasOverride[] = []): TeamResolver {
  const map = new Map<string, string>();
  for (const a of aliases) {
    const canonical = normalizeName(a.canonical);
    for (const cat of a.category ? [a.category] : (['M', 'F'] as const)) {
      for (const alias of a.aliases) map.set(`${cat}:${normalizeName(alias)}`, canonical);
    }
  }
  const canonical = (name: string, category: Category) => {
    const n = normalizeName(name);
    return map.get(`${category}:${n}`) ?? n;
  };
  return {
    canonical,
    key: (name, category) => `${category}:${canonical(name, category)}`,
  };
}
