/**
 * Client speed budgets (specs/web-experience "Client speed budgets"), task 10.3:
 * Lighthouse mobile audit (default throttling) on home, player and team pages of a production build.
 *   BASE_URL=https://localhost PLAYER=/jugadores/1-x TEAM=/equipos/1-x node scripts/lighthouse.mjs
 */
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';
import { chromium } from '@playwright/test';

const base = process.env.BASE_URL ?? 'https://localhost';
const pages = [
  ['home', '/'],
  ['player', process.env.PLAYER ?? '/jugadores'],
  ['team', process.env.TEAM ?? '/equipos'],
];
const chrome = await launch({
  chromePath: process.env.CHROME_PATH ?? chromium.executablePath(),
  chromeFlags: ['--headless=new', '--ignore-certificate-errors', '--no-sandbox'],
});
let failed = false;
try {
  for (const [name, path] of pages) {
    const runs = [];
    for (let i = 0; i < 3; i++) {
      const r = await lighthouse(`${base}${path}`, { port: chrome.port, onlyCategories: ['performance'], output: 'json', logLevel: 'error' });
      runs.push({ score: Math.round(r.lhr.categories.performance.score * 100), lcp: r.lhr.audits['largest-contentful-paint'].numericValue });
    }
    runs.sort((a, b) => a.score - b.score);
    const median = runs[1];
    const ok = median.score >= 90 && median.lcp <= 2500;
    failed ||= !ok;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(7)} performance=${median.score} LCP=${(median.lcp / 1000).toFixed(2)}s (median of 3: ${runs.map((x) => x.score).join(', ')})`);
  }
} finally {
  await chrome.kill();
}
process.exit(failed ? 1 : 0);
