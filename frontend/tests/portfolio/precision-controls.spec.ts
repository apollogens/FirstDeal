import { test, expect, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs/promises';

test.setTimeout(30000);
test.use({ actionTimeout: 5000 });

test.beforeEach(async ({ context, page }) => {
  await context.addCookies([{ name: 'restore_access', value: 'precision-fixture', domain: '127.0.0.1', path: '/' }]);
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = [];
    if (path === '/api/auth/session') json = { user: { id: 'precision-demo', full_name: 'Алекс · Демо', email: 'alex@example.test', role: 'employee', manager_id: null, timezone: 'Europe/Moscow', is_active: true } };
    else if (path.endsWith('/summary')) json = { income: '10000', expense: '3000', balance: '7000', currency: 'RUB' };
    else if (path.endsWith('/categories')) json = [{ id: 'tools', name: 'Инструменты', type: 'expense', user_id: 'precision-demo', created_at: '2026-11-06T00:00:00Z', updated_at: '2026-11-06T00:00:00Z' }];
    else if (path.endsWith('/unread-count')) json = { count: 0 };
    return route.fulfill({ json });
  });
});

async function bounds(menu: Locator) {
  const geometry = await menu.evaluate(el => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: innerWidth, height: innerHeight };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.top).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.width);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.height);
}

async function workspace(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator('main').first()).toBeVisible();
  await expect(page.locator('aside').first()).toBeAttached();
  if (url.includes('section=calendar')) await expect(page.getByText('Загружаем события...', { exact: true })).toHaveCount(0);
  else if (url.includes('section=tasks')) await expect(page.getByText('У вас пока нет задач', { exact: true })).toBeVisible();
  else if (url.includes('section=memory')) await expect(page.getByText('Воспоминания не найдены.', { exact: true })).toBeVisible();
  else if (url === '/workspace') await expect(page.getByRole('heading', { name: 'Чем помочь?', exact: true })).toBeVisible();
}

async function capture(page: Page, key: string, width: number) {
  const phase = process.env.QA_PHASE ?? 'after';
  const artifactRoot = process.env.QA_ARTIFACTS_DIR ?? '../artifacts/ui-qa';
  const dir = `${artifactRoot}/controls`;
  await fs.mkdir(dir, { recursive: true });
  const screenshot = `${dir}/${key}-${width}-${phase}.png`;
  await page.screenshot({ path: screenshot, animations: 'disabled', caret: 'initial' });
  await fs.appendFile(`${artifactRoot}/controls-manifest.jsonl`, JSON.stringify({ route: page.url(), viewport: page.viewportSize(), screenshot, fixture: true, status: 'captured after assertions' }) + '\n');
}

for (const width of [320, 768, 1920]) {
  test(`select keyboard, outside click and modal focus ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 640 });
    await workspace(page, '/workspace?section=finance');
    await expect(page.locator('[class*="finance__summaryCard"]').first()).toContainText('10 000');
    const filter = page.getByRole('button', { name: /^Операции:/ }).first();
    await filter.focus();
    await filter.press('ArrowDown');
    let list = page.getByRole('listbox', { name: 'Операции', exact: true });
    await expect(list).toBeVisible();
    await bounds(list);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(filter).toContainText('Расход');
    await expect(filter).toBeFocused();
    await filter.click();
    await page.getByRole('heading', { name: 'Финансы', exact: true }).click();
    await expect(list).toHaveCount(0);
    await page.getByRole('button', { name: 'Добавить транзакцию' }).click();
    const dialog = page.getByRole('dialog', { name: 'Новая транзакция', exact: true });
    await expect(dialog).toBeVisible();
    const select = dialog.locator('button[aria-haspopup="listbox"]').last();
    await select.focus();
    await select.press('ArrowDown');
    list = page.getByRole('listbox').last();
    await expect(list).toBeVisible();
    await bounds(list);
    await capture(page, 'select-in-dialog', width);
    await page.keyboard.press('Escape');
    await expect(list).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(select).toBeFocused();
    const submit = dialog.getByRole('button', { name: 'Добавить', exact: true });
    await submit.scrollIntoViewIfNeeded();
    await bounds(submit);
    await capture(page, 'finance-dialog-actions-visible', width);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Добавить транзакцию' })).toBeFocused();
  });

  test(`date and time popovers inside a native dialog ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 640 });
    await workspace(page, '/workspace?section=calendar');
    await page.getByRole('button', { name: 'Новое событие', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Новое событие', exact: true });
    const date = dialog.getByRole('button', { name: /^Дата события:/ });
    await date.click();
    const calendar = page.getByRole('dialog', { name: 'Дата события', exact: true });
    await expect(calendar).toBeVisible();
    await bounds(calendar);
    const selectedDay = calendar.locator('button[aria-pressed="true"]');
    await selectedDay.focus();
    const original = await selectedDay.getAttribute('aria-label');
    await page.keyboard.press('ArrowRight');
    expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).not.toBe(original);
    await capture(page, 'date-in-dialog', width);
    await page.keyboard.press('Escape');
    await expect(calendar).toHaveCount(0);
    await expect(date).toBeFocused();
    const time = dialog.getByRole('combobox', { name: 'Начало', exact: true });
    await time.focus();
    const menu = page.getByRole('dialog', { name: 'Начало', exact: true });
    await expect(menu).toBeVisible();
    await bounds(menu);
    await menu.getByRole('button', { name: '10', exact: true }).focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await menu.getByRole('button', { name: '30', exact: true }).click();
    await expect(time).toHaveValue('11:30');
    await expect(menu).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await capture(page, 'time-selected', width);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test(`native task controls and notification popover ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 640 });
    await workspace(page, '/workspace?section=tasks');
    await page.getByRole('button', { name: 'Новая задача', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const controls = dialog.locator('select');
    await controls.first().selectOption('high');
    await expect(controls.first()).toHaveValue('high');
    await capture(page, 'native-task-controls', width);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await workspace(page, '/workspace');
    const notifications = page.getByRole('button', { name: 'Уведомления', exact: true });
    await notifications.click();
    const panel = page.getByRole('region', { name: 'Уведомления', exact: true });
    await expect(panel).toBeVisible();
    await bounds(panel);
    await capture(page, 'notifications-open', width);
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await expect(notifications).toBeFocused();
  });

  test(`memory context panel preserves a usable viewport ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 640 });
    await workspace(page, '/workspace?section=memory');
    const initialPanel = page.locator('aside').filter({ has: page.getByRole('heading', { name: 'Собрать контекст', exact: true }) });
    if (await initialPanel.isVisible()) await initialPanel.getByRole('button', { name: 'Отмена', exact: true }).click();
    await page.getByRole('button', { name: 'Собрать контекст', exact: true }).click();
    const panel = page.locator('aside').filter({ has: page.getByRole('heading', { name: 'Собрать контекст', exact: true }) });
    await expect(panel).toBeVisible();
    await bounds(panel);
    await capture(page, 'memory-context-panel', width);
    await panel.getByRole('button', { name: 'Отмена', exact: true }).click();
    await expect(panel).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Память', exact: true })).toBeVisible();
  });
}

for (const theme of ['light', 'dark']) {
  test(`primary control contrast in ${theme} theme`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript(mode => localStorage.setItem('restore-theme-mode', mode), theme);
    const rows = [
      { route: '/login', name: 'Войти' },
      { route: '/workspace?section=finance', name: 'Добавить транзакцию' },
      { route: '/workspace?section=calendar', name: 'Новое событие' },
      { route: '/workspace?section=tasks', name: 'Новая задача' },
      { route: '/workspace?section=documents', name: 'Загрузить документ' },
    ];
    const evidence = [];
    for (const row of rows) {
      await page.goto(row.route);
      const button = page.getByRole('button', { name: row.name, exact: true }).first();
      await expect(button).toBeVisible();
      const measured = await button.evaluate(element => {
        const style = getComputedStyle(element);
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
        const context = canvas.getContext('2d')!;
        const rgb = (color: string) => {
          context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1);
          return Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
        };
        const luminance = (color: string) => rgb(color).map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
        const fg = luminance(style.color), bg = luminance(style.backgroundColor);
        return { color: style.color, background: style.backgroundColor, ratio: (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05) };
      });
      evidence.push({ ...row, ...measured });
      expect(measured.ratio, `${row.name} text contrast in ${theme}`).toBeGreaterThanOrEqual(4.5);
    }
    await fs.writeFile(`${process.env.QA_ARTIFACTS_DIR ?? '../artifacts/ui-qa'}/contrast-${theme}.json`, JSON.stringify(evidence, null, 2));
  });
}
