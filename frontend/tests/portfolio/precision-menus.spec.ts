import { documentFixture } from './fixtures';
import { test, expect, type Page, type Locator } from '@playwright/test';
import fs from 'node:fs/promises';

test.setTimeout(30000);
test.use({ actionTimeout: 5000 });
const stamp = '2026-11-06T09:00:00Z';
const doc = documentFixture({ id: 'menu-doc', user_id: 'portfolio-demo', filename: 'Project review with a long filename.pdf', file_size: 12000, mime_type: 'application/pdf', scope: 'work', status: 'ready', created_at: stamp, updated_at: stamp, chunks_count: 2, pages_count: 1 });
test.beforeEach(async ({ context, page }) => {
  await context.addCookies([{ name: 'restore_access', value: 'portfolio-fixture', domain: '127.0.0.1', path: '/' }]);
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = [];
    if (path.endsWith('/summary')) json = { income: '0', expense: '3000', balance: '-3000', currency: 'RUB' };
    else if (path.endsWith('/categories')) json = [{ id: 'tools', user_id: 'portfolio-demo', name: 'Инструменты', type: 'expense', created_at: stamp, updated_at: stamp }];
    else if (path.endsWith('/transactions')) json = [{ id: 'menu-tx', user_id: 'portfolio-demo', category_id: 'tools', scope: 'work', type: 'expense', amount: '3000', currency: 'RUB', date: '2026-11-06', description: 'Демо: инструменты', created_at: stamp, updated_at: stamp }];
    else if (path === '/api/documents') json = [doc];
    else if (path === '/api/chats') json = [{ id: 'menu-chat', user_id: 'portfolio-demo', title: 'Project review', created_at: stamp, updated_at: stamp }];
    else if (path === '/api/auth/session') json = { user: { id: 'portfolio-demo', full_name: 'Алекс Миров · Демо', email: 'alex@example.test', role: 'employee', manager_id: null, timezone: 'Europe/Moscow', is_active: true } };
    else if (path.endsWith('/unread-count')) json = { count: 0 };
    return route.fulfill({ json });
  });
});
async function capture(page: Page, key: string, width: number) {
  const phase = process.env.QA_PHASE ?? 'after';
  const dir = `${process.env.QA_ARTIFACTS_DIR ?? '../artifacts/ui-qa'}/menus`;
  await fs.mkdir(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/${key}-${width}-${phase}.png`, animations: 'disabled', caret: 'initial' });
}
async function bounds(menu: Locator) {
  const box = await menu.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(menu.page().viewportSize()!.width);
}
for (const width of [390, 1280]) {
  test(`transaction row menu dismissal and edit focus ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/workspace?section=finance');
    const trigger = page.getByRole('button', { name: 'Действия транзакции: Инструменты', exact: true });
    await expect(trigger).toBeVisible();
    await trigger.click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await trigger.press('ArrowDown');
    await expect(menu.getByRole('menuitem').first()).toBeFocused();
    await page.keyboard.press('End');
    await expect(menu.getByRole('menuitem').last()).toBeFocused();
    await page.keyboard.press('Home');
    await expect(menu.getByRole('menuitem').first()).toBeFocused();
    await page.getByRole('heading', { name: 'Финансы', exact: true }).click();
    await expect(menu).toHaveCount(0);
    await trigger.click();
    await capture(page, 'finance-row', width);
    await bounds(menu);
    await menu.getByRole('menuitem', { name: 'Изменить', exact: true }).focus();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await menu.getByRole('menuitem', { name: 'Изменить', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Изменить транзакцию', exact: true });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
  test(`document row menu closes with Escape ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/workspace?section=documents');
    const trigger = page.getByRole('button', { name: `Действия с ${doc.filename}`, exact: true });
    await expect(trigger).toBeVisible();
    const closeDetails = page.getByRole('button', { name: 'Закрыть сведения', exact: true });
    if (width <= 900) await expect(closeDetails).toHaveCount(0);
    else await closeDetails.click();
    await trigger.click();
    const menu = page.locator('[class*="rowMenuWrap"] > span');
    await expect(menu).toBeVisible();
    await trigger.press('ArrowDown');
    await expect(menu.getByRole('menuitem').first()).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(menu.getByRole('menuitem').last()).toBeFocused();
    await page.getByRole('heading', { name: 'Документы', exact: true }).click();
    await expect(menu).toHaveCount(0);
    await trigger.click();
    await capture(page, 'document-row', width);
    await bounds(menu);
    await menu.getByRole('menuitem', { name: 'Просмотреть', exact: true }).focus();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
  test(`history menu and delete confirmation retain focus ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/workspace?section=history');
    const trigger = page.locator('summary[aria-label*="Действия с чатом"]').first();
    await trigger.click();
    const menu = page.locator('[class*="actionMenuPanel"]').first();
    await expect(menu).toBeVisible();
    await trigger.press('ArrowDown');
    await expect(menu.getByRole('menuitem').first()).toBeFocused();
    await page.keyboard.press('End');
    await expect(menu.getByRole('menuitem').last()).toBeFocused();
    await page.getByRole('heading', { name: 'История чатов', exact: true }).click();
    await expect(menu).toBeHidden();
    await trigger.click();
    await capture(page, 'history-row', width);
    await bounds(menu);
    await menu.getByRole('menuitem', { name: 'Переименовать', exact: true }).focus();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await menu.getByRole('menuitem', { name: 'Удалить', exact: true }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
}

for (const width of [320, 390]) {
  test(`mobile keyboard-sized viewport preserves composer ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 420 });
    await page.goto('/workspace');
    await expect(page.getByRole('heading', { name: 'Чем помочь?', exact: true })).toBeVisible();
    const composer = page.locator('textarea').last();
    const box = await composer.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(420);
    const send = page.getByRole('button', { name: /Отправить/ }).first();
    const sendBox = await send.boundingBox();
    expect(sendBox!.y + sendBox!.height).toBeLessThanOrEqual(420);
    await page.getByRole('group', { name: 'Быстрые действия', exact: true }).getByRole('button').last().scrollIntoViewIfNeeded();
    await capture(page, 'keyboard-height', width);
  });
}

for (const width of [390, 1280]) {
  test(`category editor restores its launcher ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/workspace?section=finance');
    const legend = page.locator('[class*="finance__legend"] > div').first();
    await expect(legend).toBeVisible();
    const cells = await legend.locator(':scope > *').evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; }));
    for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
      const a = cells[i], b = cells[j];
      expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top).toBeTruthy();
    }
    const trigger = page.locator('[data-category-edit="tools"]');
    await expect(trigger).toBeVisible();
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Изменить категорию', exact: true });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
}
