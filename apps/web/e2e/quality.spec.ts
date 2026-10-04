import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Ids } from './fixtures';

export const pages = (ids: Ids) => [
  '/',
  '/temporadas',
  '/temporadas/2025',
  '/torneos',
  `/torneos/${ids.apertura2025}`,
  `/torneos/${ids.apertura2025}/fases/${ids.phaseApertura}`,
  '/partidos/19906',
  '/equipos',
  `/equipos/${ids.aleman}`,
  `/equipos/${ids.aleman}?tab=rivales`,
  '/jugadores',
  `/jugadores/${ids.player.id}-${ids.player.slug}`,
  `/jugadores/${ids.player.id}-${ids.player.slug}?tab=partidos`,
  '/records',
  '/records/jugadores/goles',
  '/records/equipos/titulos',
  '/campeones',
  `/comparar/equipos?a=${ids.aleman.split('-')[0]}&b=${ids.hebraica.split('-')[0]}`,
  '/sobre-los-datos',
];

const PAGE_COUNT = 19;

test.describe('10.4 accessibility', () => {
  for (const scheme of ['light', 'dark'] as const) {
    for (let i = 0; i < PAGE_COUNT; i++) {
      test(`page ${i + 1} has no serious or critical axe violations (${scheme})`, async ({ page, ids }) => {
        const url = pages(ids)[i]!;
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto(url);
        await page.locator('main h1').first().waitFor();
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
        expect(bad.map((v) => `${url}: ${v.id} (${v.nodes.length}) ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
      });
    }
  }

  test('a leaderboard is fully operable by keyboard with visible focus', async ({ page }) => {
    await page.goto('/records/jugadores/goles');
    await page.locator('main h1').waitFor();
    // Tab until the "PJ" sort button has focus, then sort with Enter.
    let found = false;
    for (let i = 0; i < 40 && !found; i++) {
      await page.keyboard.press('Tab');
      found = await page.evaluate(() => document.activeElement?.textContent?.trim() === 'PJ');
    }
    expect(found).toBe(true);
    const outline = await page.evaluate(() => getComputedStyle(document.activeElement as Element).outlineStyle);
    expect(outline).not.toBe('none');
    await page.keyboard.press('Enter');
    await expect(page.locator('th[aria-sort]')).toHaveCount(1);
    // Row links are reachable too.
    let onPlayer = false;
    for (let i = 0; i < 10 && !onPlayer; i++) {
      await page.keyboard.press('Tab');
      onPlayer = await page.evaluate(() => (document.activeElement as HTMLAnchorElement | null)?.href?.includes('/jugadores/') ?? false);
    }
    expect(onPlayer).toBe(true);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/jugadores\/\d+-/);
  });
});

test.describe('10.5 responsive layout at 360 px', () => {
  test.use({ viewport: { width: 360, height: 760 } });

  test('no page-level horizontal scroll and tables keep the first column visible', async ({ page, ids }) => {
    test.setTimeout(120_000);
    for (const url of pages(ids)) {
      await page.goto(url);
      await page.locator('main h1').first().waitFor();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${url} scrolls horizontally by ${overflow}px`).toBeLessThanOrEqual(0);
    }
    await page.goto(`/equipos/${ids.aleman}?tab=rivales`);
    const scroller = page.locator('[data-slot=table-scroll]').first();
    await scroller.evaluate((el) => el.scrollBy({ left: 400 }));
    const firstCell = page.locator('tbody tr').first().locator('td').first();
    expect(await firstCell.evaluate((el) => getComputedStyle(el).position)).toBe('sticky');
    const box = await firstCell.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x).toBeLessThan(40);
  });
});
