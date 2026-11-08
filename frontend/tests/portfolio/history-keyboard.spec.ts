import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
const historyEvidence = `${process.env.QA_ARTIFACTS_DIR ?? '../artifacts/frontend-audit'}/history`;

const stamp = '2026-11-06T09:00:00Z';

test.beforeEach(async ({ context, page }) => {
  await context.addCookies([{ name: 'restore_access', value: 'portfolio-fixture', domain: '127.0.0.1', path: '/' }]);
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/chats') return route.fulfill({ json: [{ id: 'keyboard-chat', user_id: 'portfolio-demo', title: 'Keyboard selection sample', created_at: stamp, updated_at: stamp }, { id: 'keyboard-chat-two', user_id: 'portfolio-demo', title: 'Second keyboard sample', created_at: stamp, updated_at: stamp }] });
    if (path === '/api/auth/session') return route.fulfill({ json: { user: { id: 'portfolio-demo', full_name: 'Demo User', email: 'demo@example.test', role: 'employee', manager_id: null, timezone: 'Europe/Moscow', is_active: true } } });
    if (path.endsWith('/unread-count')) return route.fulfill({ json: { count: 0 } });
    return route.fulfill({ json: [] });
  });
});

test('history row selection is keyboard operable and pin does not select it', async ({ page }, info) => {
  await page.goto('/workspace?section=history');
  const select = page.getByRole('button', { name: '\u0412\u044b\u0431\u0440\u0430\u0442\u044c \u0447\u0430\u0442 \u00abKeyboard selection sample\u00bb' });
  await expect(select).toBeVisible();
  await select.focus();
  await page.keyboard.press('Enter');
  await expect(select).toHaveAttribute('aria-pressed', 'true');
  const second = page.getByRole('button', { name: '\u0412\u044b\u0431\u0440\u0430\u0442\u044c \u0447\u0430\u0442 \u00abSecond keyboard sample\u00bb' });
  await second.focus();
  await page.keyboard.press('Space');
  await expect(second).toHaveAttribute('aria-pressed', 'true');
  await expect(select).toHaveAttribute('aria-pressed', 'false');
  const pin = page.locator('article').filter({ has: select }).getByRole('button', { name: '\u0417\u0430\u043a\u0440\u0435\u043f\u0438\u0442\u044c \u0447\u0430\u0442' });
  await pin.focus();
  await expect(pin).toHaveCSS('opacity', '1');
  await page.keyboard.press('Enter');
  await expect(page.locator('article').filter({ has: select }).getByRole('button', { name: 'Открепить чат', exact: true })).toBeVisible();
  await expect(select).toHaveAttribute('aria-pressed', 'false');
  await expect(second).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Закрыть панель', exact: true }).click();
  await fs.mkdir(historyEvidence, { recursive: true });
  await page.screenshot({ path: `${historyEvidence}/${info.project.name}-after.png`, animations: 'disabled' });
});

test('history controls stay on one row at all audited widths in both themes', async ({ page }, info) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/workspace?section=history');
  await fs.mkdir(historyEvidence, { recursive: true });
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
    for (const width of [320, 360, 390, 768, 1024, 1280, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      const select = page.getByRole('button', { name: 'Выбрать чат «Keyboard selection sample»' });
      const row = page.locator('article').filter({ has: select });
      const pin = row.getByRole('button', { name: 'Закрепить чат' });
      await expect(select).toBeVisible();
      const selectionBox = await select.boundingBox();
      const pinBox = await pin.boundingBox();
      expect(selectionBox).not.toBeNull();
      expect(pinBox).not.toBeNull();
      if (!selectionBox || !pinBox) throw new Error('History controls have no layout box');
      expect(Math.abs(selectionBox.y + selectionBox.height / 2 - pinBox.y - pinBox.height / 2)).toBeLessThan(2);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const create = page.locator('header').filter({ has: page.getByRole('heading', { name: 'История чатов' }) }).getByRole('button', { name: 'Новый чат', exact: true });
      await expect(create).toBeVisible();
      if (width <= 620) {
        await expect(create.locator('span')).toBeHidden();
        const icon = await create.locator('svg').boundingBox();
        expect(icon?.width).toBeGreaterThanOrEqual(16);
        expect((await create.boundingBox())?.width).toBeGreaterThanOrEqual(40);
      }
      await page.screenshot({ path: `${historyEvidence}/${info.project.name}-${theme}-${width}.png`, animations: 'disabled' });
    }
  }
  expect(errors).toEqual([]);
});
