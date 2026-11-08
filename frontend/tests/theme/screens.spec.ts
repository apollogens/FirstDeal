import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { mockThemeApi, routes } from './fixtures';
import { auditTextContrast, auditSemanticContrast } from './contrast';

async function switchTheme(page: Page, target: 'light' | 'dark') {
  const toggle = page.getByRole('switch', { name: /Включить (светлую|тёмную) тему/ }).first();
  const details = page.getByRole('button', { name: 'Закрыть сведения', exact: true });
  if (await details.isVisible()) await details.click();
  const memoryClose = page.locator('aside').filter({ has: page.getByRole('heading', { name: 'Собрать контекст', exact: true }) }).getByRole('button', { name: 'Закрыть', exact: true });
  if (await memoryClose.isVisible()) await memoryClose.click();
  if (!await toggle.isVisible()) await page.getByRole('button', { name: 'Открыть меню', exact: true }).first().click();
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', target);
  expect(await page.evaluate(() => localStorage.getItem('restore-theme-mode'))).toBe(target);
}

test('all route surfaces and text contrast', async ({ page, context }, info) => {
  const theme = info.project.name.endsWith('-dark') ? 'dark' : 'light';
  const phase = process.env.THEME_QA_PHASE ?? 'after';
  const run = process.env.THEME_QA_RUN ?? '';
  const dir = path.resolve('../artifacts/theme-qa', `${phase}${run ? `-${run}` : ''}`, info.project.name);
  await fs.mkdir(dir, { recursive: true });
  await context.addCookies([{ name: 'restore_access', value: 'portfolio-fixture', domain: '127.0.0.1', path: '/' }]);
  await context.addInitScript(mode => {
    if (localStorage.getItem('restore-theme-mode') === null) localStorage.setItem('restore-theme-mode', mode);
    const observer = new MutationObserver(() => {
      if (document.querySelector('main')) {
        document.documentElement.dataset.qaThemeAtContent = document.documentElement.dataset.theme ?? 'missing';
        observer.disconnect();
      }
    });
    observer.observe(document, { childList: true, subtree: true });
  }, theme);
  await mockThemeApi(page);
  const errors: string[] = [];
  const watch = (target: Page) => {
    target.on('pageerror', e => errors.push(e.message));
    target.on('console', m => { if ((m.type() === 'error' || /hydration|did not match/i.test(m.text())) && !m.text().includes('ws://127.0.0.1:3211/api/v1/ws')) errors.push(m.text()); });
  };
  watch(page);
  const measurements = [];
  const semantics = [];
  for (const route of routes) {
    await page.goto(route.url, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: route.heading, exact: true }).first()).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    if (phase === 'after') {
      await expect(page.locator('html')).toHaveAttribute('data-qa-theme-at-content', theme);
      await expect(page.locator('html')).toHaveCSS('color-scheme', theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route.key} body overflow`).toBe(true);
    }
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode())); });
    await page.screenshot({ path: path.join(dir, `${route.key}.png`), fullPage: true, animations: 'disabled' });
    const text = await auditTextContrast(page);
    measurements.push({ route: route.url, key: route.key, theme, viewport: page.viewportSize(), text, failures: text.filter(t => !t.complexBackground && t.ratio < t.threshold) });
    if (phase === 'after') {
      const pairs = await auditSemanticContrast(page);
      semantics.push({ key: route.key, pairs });
      expect.soft(pairs.filter(pair => pair.ratio < pair.minimum), `${route.key} semantic contrast`).toEqual([]);
      const opposite = theme === 'dark' ? 'light' : 'dark';
      await switchTheme(page, opposite);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.locator('html')).toHaveAttribute('data-theme', opposite);
      await expect(page.locator('html')).toHaveAttribute('data-qa-theme-at-content', opposite);
      const second = await context.newPage();
      watch(second); await mockThemeApi(second);
      await second.goto(route.url, { waitUntil: 'domcontentloaded' });
      await expect(second.locator('html')).toHaveAttribute('data-theme', opposite);
      await expect(second.locator('html')).toHaveAttribute('data-qa-theme-at-content', opposite);
      await second.close();
      await expect(page.getByRole('heading', { name: route.heading, exact: true }).first()).toBeVisible();
      await switchTheme(page, theme);
    }
  }
  await fs.writeFile(path.join(dir, 'contrast.json'), JSON.stringify({ measurements, semantics, errors }, null, 2));
  expect(errors).toEqual([]);
  if (phase === 'after') expect(measurements.flatMap(row => row.failures.map(failure => ({ route: row.key, ...failure })))).toEqual([]);
});
