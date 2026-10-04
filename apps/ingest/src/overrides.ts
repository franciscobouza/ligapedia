import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseOverrides, type Overrides } from '@ligapedia/domain';

/** data/overrides of the repository (same depth from apps/ingest/src and apps/ingest/dist). */
export function overridesDir(): string {
  return process.env.LIGAPEDIA_OVERRIDES_DIR ?? fileURLToPath(new URL('../../../data/overrides', import.meta.url));
}

/** Read data/overrides/*.yaml (missing files mean "no overrides"). */
export function readOverrides(dir = overridesDir()): Overrides {
  const read = (f: string) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : undefined);
  return parseOverrides({
    displayNames: read('display-names.yaml'),
    teamAliases: read('team-aliases.yaml'),
    phases: read('phases.yaml'),
    champions: read('champions.yaml'),
  });
}
