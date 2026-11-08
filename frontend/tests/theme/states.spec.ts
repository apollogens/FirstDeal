import { test, expect, type Page, type TestInfo } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { mockThemeApi, watchThemeRuntime } from './fixtures';
import { auditTextContrast, auditSemanticContrast } from './contrast';

test.setTimeout(90_000);
const runtimeErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => { runtimeErrors.set(page, watchThemeRuntime(page)); });
test.afterEach(({ page }) => { expect.soft(runtimeErrors.get(page)).toEqual([]); });

async function prepare(page: Page, info: TestInfo, populated = false) {
  const theme = info.project.name.endsWith('-dark') ? 'dark' : 'light';
  await page.context().addCookies([{ name: 'restore_access', value: 'portfolio-fixture', domain: '127.0.0.1', path: '/' }]);
  await page.addInitScript(mode => localStorage.setItem('restore-theme-mode', mode), theme);
  await mockThemeApi(page, populated);
}

async function capture(page: Page, info: TestInfo, key: string) {
  const run = process.env.THEME_QA_RUN ?? '';
  const dir = path.resolve('../artifacts/theme-qa', `after${run ? `-${run}` : ''}`, info.project.name, 'states');
  await fs.mkdir(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${key}.png`), fullPage: true, animations: 'disabled' });
  const text = await auditTextContrast(page);
  const semantics = await auditSemanticContrast(page);
  const failures = text.filter(row => !row.complexBackground && row.ratio < row.threshold);
  await fs.writeFile(path.join(dir, `${key}.contrast.json`), JSON.stringify({ text, failures, semantics }, null, 2));
  expect(text.length).toBeGreaterThan(0);
  expect.soft(failures, `${key} text contrast`).toEqual([]);
  expect.soft(semantics.filter(pair => pair.ratio < pair.minimum), `${key} semantic/control contrast`).toEqual([]);
}

test('empty states across data screens', async ({ page }, info) => {
  await prepare(page, info);
  for (const section of ['finance', 'calendar', 'tasks', 'documents', 'memory', 'history']) {
    await page.goto(`/workspace?section=${section}`, { waitUntil: 'networkidle' });
    if (section === 'finance') {
      const amounts = page.locator('[class*="finance__summaryCard"] strong');
      await expect(amounts).toHaveCount(3);
      for (const amount of await amounts.all()) await expect(amount).toHaveText(/^0(?:[.,]0+)?\s*₽$/);
    }
    await capture(page, info, `${section}-empty`);
  }
  await page.goto('/mail/inbox', { waitUntil: 'networkidle' });
  await expect(page.getByText('Писем пока нет', { exact: true })).toBeVisible();
  await capture(page, info, 'mail-empty');
});

test('loading and error banners remain readable', async ({ page }, info) => {
  await prepare(page, info);
  let release: (() => void) | undefined;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/documents**', async route => { await gate; await route.fulfill({ status: 503, json: { detail: 'Theme QA: unavailable' } }); });
  await page.goto('/workspace?section=documents', { waitUntil: 'domcontentloaded' });
  await expect(page.getByLabel('Загрузка документов', { exact: true })).toBeVisible();
  await capture(page, info, 'documents-loading');
  release?.();
  await expect(page.getByRole('heading', { name: 'Не удалось загрузить документы', exact: true })).toBeVisible();
  await capture(page, info, 'documents-error');
  await page.route('**/api/mail/accounts**', route => route.fulfill({ status: 503, json: { detail: 'Theme QA: unavailable' } }));
  await page.goto('/mail/connect', { waitUntil: 'networkidle' });
  await expect(page.getByRole('alert').filter({ hasText: 'Theme QA: unavailable' })).toBeVisible();
  await capture(page, info, 'mail-error');
});

test('all settings subsections and keyboard focus', async ({ page }, info) => {
  await prepare(page, info);
  await page.goto('/workspace?section=settings', { waitUntil: 'networkidle' });
  for (const [key, label] of [['general', 'Общие'], ['assistant', 'Ассистент'], ['notifications', 'Уведомления'], ['data', 'Данные и доступ'], ['integrations', 'Интеграции']]) {
    const button = page.getByRole('button', { name: label, exact: true }).last();
    await button.click();
    await button.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(button).toBeFocused();
    await expect(button).toHaveCSS('outline-style', 'solid');
    await capture(page, info, `settings-${key}`);
  }
});
