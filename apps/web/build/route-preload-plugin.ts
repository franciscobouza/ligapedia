import { readFileSync } from 'node:fs';
import type { Rollup } from 'vite';

type OutputChunk = Rollup.OutputChunk;
import type { Plugin } from 'vite';

/**
 * Emits /boot.js from build/boot.template.js with a map route file → JS chunks (route component chunk
 * plus its static imports, minus what the entry already loads). boot.js modulepreloads the current
 * route's chunks so they download in parallel with the main bundle instead of after it.
 */
export function routePreload(): Plugin {
  const template = new URL('./boot.template.js', import.meta.url);
  return {
    name: 'ligapedia-route-preload',
    // Dev server: serve the template with an empty map.
    configureServer(server) {
      server.middlewares.use('/boot.js', (_req, res) => {
        res.setHeader('content-type', 'text/javascript');
        res.end(readFileSync(template, 'utf8').replace('/* route chunks */ {}', '{}'));
      });
    },
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter((c): c is OutputChunk => c.type === 'chunk');
      const byFile = new Map(chunks.map((c) => [c.fileName, c]));
      const entryFiles = new Set<string>();
      const collect = (file: string, into: Set<string>) => {
        const c = byFile.get(file);
        if (!c || into.has(file)) return;
        into.add(file);
        for (const dep of c.imports) collect(dep, into);
      };
      for (const c of chunks) if (c.isEntry) collect(c.fileName, entryFiles);
      const map: Record<string, string[]> = {};
      for (const c of chunks) {
        const m = /\/src\/routes\/(.+)\.tsx\?tsr-split=component/.exec(c.facadeModuleId ?? '');
        if (!m) continue;
        const files = new Set<string>();
        collect(c.fileName, files);
        const key = m[1]!.replace(/_$/, '');
        map[key] = [...files].filter((f) => !entryFiles.has(f)).map((f) => `/${f}`);
      }
      this.emitFile({
        type: 'asset',
        fileName: 'boot.js',
        source: readFileSync(template, 'utf8').replace('/* route chunks */ {}', JSON.stringify(map)),
      });
    },
  };
}
