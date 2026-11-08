import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';

const user = { id: 'portfolio-demo', email: 'alex@example.test', full_name: 'Алекс Миров · Демо', role: 'employee', manager_id: null, timezone: 'Europe/Moscow', is_active: true };

test.beforeEach(async ({ context, page }) => {
  await context.addCookies([{ name: 'restore_access', value: 'portfolio-fixture', domain: '127.0.0.1', path: '/' }]);
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = [];
    if (path === '/api/auth/session') body = { user };
    else if (path.endsWith('/summary')) body = { currency: 'RUB', income: '0', expense: '0', balance: '0' };
    else if (path.endsWith('/unread-count')) body = { count: 0 };
    else if (path === '/api/mail/messages') body = { items: [], total: 0 };
    else if (path === '/api/version') body = { version: 'portfolio-demo' };
    else if (path.includes('/connect/')) return route.fulfill({ status: 503, json: { message: 'Демо: внешний провайдер недоступен' } });
    return route.fulfill({ json: body });
  });
});

async function capture(page: Page, name: string, project: string) {
  await page.evaluate(() => document.fonts.ready);
  const phase = process.env.QA_PHASE ?? 'after';
  const dir = process.env.QA_ARTIFACTS_DIR ?? `../artifacts/qa/${phase}`;
  await fs.mkdir(dir, { recursive: true });
  const path = `${dir}/${name}-${project}.png`;
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
  await fs.appendFile(`${dir}/manifest.jsonl`, JSON.stringify({ route: page.url(), viewport: page.viewportSize(), screenshot: path, fixture: true, captured: true }) + '\n');
}

for (const section of ['giga', 'finance', 'tasks', 'calendar', 'documents', 'settings', 'history', 'memory', 'mail']) {
  test(`screen ${section}`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(section === 'mail' ? '/mail' : `/workspace?section=${section}`);
    await expect(page.locator('aside').first()).toBeAttached();
    await expect(page.getByText('Алекс Миров · Демо').first()).toBeAttached();
    await page.waitForTimeout(500);
    await capture(page, section, info.project.name);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (process.env.QA_PHASE !== 'before') {
      await expect(page.locator('body')).not.toContainText(/restore:|Restore Agent|GigaChat|ГигаЧат/i);
    }
  });
}

test('finance zero chart is honest', async ({ page }) => {
  await page.goto('/workspace?section=finance');
  const chart = page.getByRole('img', { name: /Расходы/ });
  await expect(chart).toBeVisible();
  await expect(chart).toContainText('Нет расходов');
  expect(await chart.evaluate(el => getComputedStyle(el).backgroundImage)).toBe('none');
});

test('notifications open and close', async ({ page }, info) => {
  await page.goto('/workspace');
  await page.getByRole('button', { name: 'Уведомления', exact: true }).click();
  await expect(page.getByText('Уведомлений пока нет.')).toBeVisible();
  await capture(page, 'notifications', info.project.name);
  await page.getByRole('button', { name: 'Закрыть уведомления' }).click();
  await expect(page.getByText('Уведомлений пока нет.')).toHaveCount(0);
});

test('navigation opens the selected screen and closes the mobile drawer', async ({ page }, info) => {
  await page.goto('/workspace');
  const sidebar = page.locator('aside').first();
  if (info.project.name === 'mobile') {
    await expect(sidebar).toBeHidden();
    await page.getByRole('button', { name: 'Открыть меню', exact: true }).click();
    await expect(sidebar).toBeVisible();
    await capture(page, 'mobile-navigation', info.project.name);
  }
  await sidebar.getByRole('button', { name: 'Задачи', exact: true }).click();
  await expect(page).toHaveURL(/section=tasks/);
  await expect(page.getByRole('heading', { name: 'Задачи', exact: true })).toBeVisible();
  if (info.project.name === 'mobile') await expect(sidebar).toBeHidden();
});

test('login has neutral branding', async ({ page, context }, info) => {
  await context.clearCookies();
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeVisible();
  if (process.env.QA_PHASE !== 'before') {
    await expect(page.getByRole('heading', { name: 'Войдите в Workspace AI', exact: true })).toBeVisible();
    await expect(page).toHaveTitle(/Workspace AI/);
  }
  await capture(page, 'login', info.project.name);
  if (process.env.QA_PHASE !== 'before') await expect(page.locator('body')).not.toContainText(/restore:|Restore Agent/i);
});
