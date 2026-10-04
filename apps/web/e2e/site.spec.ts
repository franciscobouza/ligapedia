import { expect, test } from './fixtures';

const num = (id: string) => id.split('-')[0]!;

test.describe('8.x foundation', () => {
  test('8.2 the theme choice persists across reloads', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    await page.getByRole('button', { name: 'Cambiar tema' }).click();
    await page.getByRole('menuitemradio', { name: 'Oscuro' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
  });

  test('8.3 unknown match shows a Spanish not-found page', async ({ page }) => {
    await page.goto('/partidos/1');
    await expect(page.getByRole('heading', { name: 'Partido no encontrado' })).toBeVisible();
  });

  test('8.3 a wrong slug redirects to the canonical player URL', async ({ page, ids }) => {
    await page.goto(`/jugadores/${ids.player.id}-slug-equivocado`);
    await expect(page).toHaveURL(new RegExp(`/jugadores/${ids.player.id}-${ids.player.slug}$`));
    await expect(page.getByRole('heading', { level: 1, name: ids.player.name })).toBeVisible();
  });

  test('8.4 shows Montevideo time to a visitor in Europe/Madrid, and the freshness text', async ({ browser }) => {
    const context = await browser.newContext({ timezoneId: 'Europe/Madrid', locale: 'es-ES' });
    const page = await context.newPage();
    await page.goto('/partidos/92923');
    await expect(page.getByText(/vie 16 may 2025 · 20:45/)).toBeVisible();
    await expect(page.getByText(/Datos actualizados: \d{1,2} (ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic) \d{4}, \d{2}:\d{2}/)).toBeVisible();
    await context.close();
  });

  test('8.4 numbers use a decimal comma', async ({ page, ids }) => {
    await page.goto(`/equipos/${ids.aleman}`);
    await expect(page.getByText('62,5%')).toBeVisible();
  });
});

test.describe('9.x pages', () => {
  test('9.1 home shows recent results, standings and scorers', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Últimos resultados · 2025/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Posiciones · Apertura 2025/ })).toBeVisible();
    await expect(page.getByText(/Goleadores 2025 · Masculino/)).toBeVisible();
  });

  test('9.2 seasons are listed 2026 → 2006 and 2019 groups both categories', async ({ page }) => {
    await page.goto('/temporadas');
    const years = page.locator('a[href^="/temporadas/"]');
    await expect(years.first()).toHaveText('2026');
    await expect(years.last()).toHaveText('2006');
    await page.goto('/temporadas/2019');
    await expect(page.getByRole('heading', { level: 2, name: 'Masculino' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Femenino' })).toBeVisible();
  });

  test('9.3 tournament shows the champion and standings; the phase filters by round and computes standings after a round', async ({ page, ids }) => {
    await page.goto(`/torneos/${ids.apertura2025}`);
    await expect(page.getByText('Campeón:')).toBeVisible();
    await expect(page.locator('main').getByRole('link', { name: 'Aleman Universitario' }).first()).toBeVisible();
    const firstRow = page.locator('table').first().locator('tbody tr').first();
    await expect(firstRow).toContainText('Bohemios FS');
    await page.goto(`/torneos/${ids.apertura2025}/fases/${ids.phaseApertura}?fecha=3`);
    await expect(page.getByRole('heading', { name: 'Fecha 3', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Fecha 1', exact: true })).toHaveCount(0);
    await page.goto(`/torneos/${ids.apertura2025}/fases/${ids.phaseApertura}?despues=2`);
    await expect(page.getByText('Tabla calculada después de la fecha 2')).toBeVisible();
  });

  test('9.4 match page shows goal tallies, unattributed goals, own goals, walk-overs and referees notice', async ({ page }) => {
    await page.goto('/partidos/19908');
    await expect(page.getByText('Gol sin autor registrado')).toHaveCount(2);
    await expect(page.getByText('×9')).toBeVisible();
    await page.goto('/partidos/19906');
    await expect(page.getByText('×3')).toHaveCount(2); // 8–8 published as per-scorer goal counts
    await expect(page.getByText('Gol sin autor registrado')).toHaveCount(0);
    await expect(page.getByText('(e.c.)')).toBeVisible();
    await expect(page.getByText('Sin datos de árbitros')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Historial completo' })).toBeVisible();
    await page.goto('/partidos/55623');
    await expect(page.getByText('Partido ganado por W.O.')).toBeVisible();
    await expect(page.getByText('Equipo local (CUBA) no se presenta.')).toBeVisible();
  });

  test('9.5 team profile tabs keep their state and filters in the URL', async ({ page, ids }) => {
    await page.goto(`/equipos/${ids.bohemios}`);
    for (const [tab, check] of [
      ['Temporadas', 'Historial por temporada'],
      ['Plantel', 'Plantel'],
      ['Rivales', 'Historial contra todos los rivales'],
      ['Líderes', 'Máximos goleadores'],
      ['Partidos', 'partidos'],
    ] as const) {
      await page.getByRole('tab', { name: tab }).click();
      await expect(page).toHaveURL(new RegExp(`tab=${tab === 'Líderes' ? 'lideres' : tab.toLowerCase()}`));
      await expect(page.getByText(check).first()).toBeAttached();
    }
    await page.getByRole('combobox', { name: 'Temporada' }).click();
    await page.getByRole('option', { name: '2025' }).click();
    await expect(page).toHaveURL(/temporada=2025/);
  });

  test('9.6 player profile tabs work and never expose the membership card number', async ({ page, ids }) => {
    await page.goto(`/jugadores/${ids.player.id}-${ids.player.slug}`);
    for (const tab of ['Temporadas', 'Partidos', 'Rivales', 'Hitos', 'Resumen']) {
      await page.getByRole('tab', { name: tab }).click();
      await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('data-state', 'active');
      expect(page.url()).not.toContain(ids.player.carne);
      expect(await page.content()).not.toContain(ids.player.carne);
    }
  });

  test('9.7 compares two teams, two players, and explains when they never met', async ({ page, ids }) => {
    await page.goto(`/comparar/equipos?a=${num(ids.aleman)}&b=${num(ids.hebraica)}`);
    await expect(page.getByText('Victorias Aleman Universitario')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Todos los partidos' })).toBeVisible();
    await page.goto(`/comparar/equipos?a=${num(ids.lourdes)}&b=${num(ids.ort)}&hasta=2008`);
    await expect(page.getByText(/no se enfrentaron/)).toBeVisible();
    await page.goto(`/comparar/jugadores?a=${ids.player.id}&b=${ids.playerOld.id}`);
    await expect(page.getByText('No coincidieron en ningún partido.', { exact: true })).toBeVisible();
  });

  test('9.8 a shared leaderboard URL reproduces the view and back/forward restore filters', async ({ page, browser }) => {
    await page.goto('/records/jugadores/goles?rama=masculino&desde=2014&hasta=2026&top=50');
    await expect(page.getByRole('heading', { name: 'Más goles' })).toBeVisible();
    const fresh = await browser.newContext();
    const other = await fresh.newPage();
    await other.goto(page.url());
    await expect(other.getByRole('combobox', { name: 'Rama' })).toHaveText('Masculino');
    await expect(other.getByRole('combobox', { name: 'Mostrar' })).toHaveText('Top 50');
    await fresh.close();

    await page.goto('/records/jugadores/goles?temporada=2024');
    await page.getByRole('combobox', { name: 'Temporada' }).click();
    await page.getByRole('option', { name: '2025' }).click();
    await expect(page).toHaveURL(/temporada=2025/);
    await page.goBack();
    await expect(page).toHaveURL(/temporada=2024/);
    await expect(page.getByRole('combobox', { name: 'Temporada' })).toHaveText('2024');
    await page.goForward();
    await expect(page).toHaveURL(/temporada=2025/);
  });

  test('9.9 keyboard-only search reaches a team page', async ({ page }) => {
    await page.goto('/');
    await page.locator('body').press('/');
    await expect(page.getByPlaceholder('Buscar jugadores, equipos o torneos…')).toBeFocused();
    await page.keyboard.type('lourdes');
    await expect(page.getByRole('option', { name: /Nuestra Señora de Lourdes/ })).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/equipos\/\d+-nuestra-senora-de-lourdes/);
  });

  test('9.10 "Sobre los datos" is linked from the footer', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('contentinfo').getByRole('link', { name: 'Sobre los datos' }).click();
    await expect(page.getByRole('heading', { name: 'Cómo se determina el campeón' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Goles sin autor registrado' })).toBeVisible();
  });
});
