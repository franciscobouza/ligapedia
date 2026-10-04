// Client speed budget (specs/web-experience): JavaScript needed for the first page ≤ 200 KB gzip.
// First page = the entry chunk + its static imports + the home route's lazy chunks and their static imports.
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('./dist/.vite/manifest.json', import.meta.url), 'utf8'));
const files = new Set();
const visit = (key) => {
  const chunk = manifest[key];
  if (!chunk || files.has(chunk.file)) return;
  files.add(chunk.file);
  for (const dep of chunk.imports ?? []) visit(dep);
};
for (const [key, chunk] of Object.entries(manifest)) {
  if (chunk.isEntry || key.startsWith('src/routes/index.tsx') || key.startsWith('src/routes/__root.tsx')) visit(key);
}

export default [
  {
    name: 'first route (home) JavaScript',
    path: [...files].filter((f) => f.endsWith('.js')).map((f) => `dist/${f}`),
    limit: '200 KB',
    gzip: true,
  },
];
