import { test, expect, type Page, type TestInfo } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chat, fact, task, stamp, mockThemeApi, watchThemeRuntime } from '../theme/fixtures';
import { documentFixture } from '../portfolio/fixtures';
import { auditTextContrast } from '../theme/contrast';

test.setTimeout(45_000);
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  errors.set(page, watchThemeRuntime(page));
  test.skip(process.env.MOBILE_QA_PHASE !== 'after', 'Interaction acceptance follows the baseline.');
  page.setDefaultTimeout(10_000);
});
test.afterEach(({ page }) => { expect.soft(errors.get(page) ?? []).toEqual([]); });

async function prepare(page: Page, info: TestInfo) {
  const theme = info.project.name.endsWith('-dark') ? 'dark' : 'light';
  await page.context().addCookies([{ name: 'restore_access', value: 'portfolio-fixture', domain: '127.0.0.1', path: '/' }]);
  await page.addInitScript(mode => localStorage.setItem('restore-theme-mode', mode), theme);
  await mockThemeApi(page);
}

async function capture(page: Page, info: TestInfo, key: string) {
  const dir = path.resolve('../artifacts/mobile-qa/after/states', info.project.name);
  await fs.mkdir(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${key}.png`), animations: 'disabled' });
  const rows = await auditTextContrast(page);
  const failures = rows.filter(row => !row.complexBackground && row.ratio < row.threshold);
  await fs.writeFile(path.join(dir, `${key}.contrast.json`), JSON.stringify({ rows, failures }, null, 2));
  expect.soft(failures, `${key} readable text`).toEqual([]);
}

test('loaded long chat and code stay within the viewport; action requires a touch confirmation', async ({ page }, info) => {
  await prepare(page, info);
  const action = { id: 'mobile-action', chat_id: chat.id, turn_id: 'mobile-turn', kind: 'create_calendar_event', status: 'pending', result_id: null, expires_at: '2099-01-01T00:00:00Z', resolved_at: null, created_at: stamp,
    payload: { title: 'Демо: обзор проекта', scope: 'work', description: 'Вымышленное действие.', starts_at: stamp, ends_at: '2026-11-08T10:00:00+03:00', location: null, remind_at: null } };
  const content = 'Подробный обзор проекта. '.repeat(70) + '\n\n```typescript\nconst longValue = "' + 'x'.repeat(220) + '";\n```\n\nКонец обзора.';
  const message = { id: 'mobile-message', chat_id: chat.id, turn_id: action.turn_id, sequence: 1, role: 'assistant', content, model: null, prompt_tokens: null, completion_tokens: null, created_at: stamp };
  let writes = 0;
  await page.route(`**/api/chats/${chat.id}/messages**`, route => route.fulfill({ json: { items: [message], next_before_sequence: null } }));
  await page.route(`**/api/chats/${chat.id}/actions**`, route => {
    if (route.request().method() !== 'GET') { writes++; return route.fulfill({ status: 503, json: { message: 'Демо: действие недоступно.' } }); }
    return route.fulfill({ json: [action] });
  });
  await page.goto(`/workspace?chat=${chat.id}`, { waitUntil: 'networkidle' });
  const confirm = page.getByRole('button', { name: 'Создать событие', exact: true });
  await expect(confirm).toBeVisible();
  expect(writes).toBe(0);
  const code = page.locator('pre').first();
  await code.scrollIntoViewIfNeeded();
  const geometry = await code.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { right: rect.right, left: rect.left, width: innerWidth, scrollable: element.scrollWidth > element.clientWidth, overflow: getComputedStyle(element).overflowX };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.width + 1);
  expect(geometry.scrollable).toBe(true);
  expect(['auto', 'scroll']).toContain(geometry.overflow);
  expect(await page.evaluate(() => scrollX)).toBe(0);
  await capture(page, info, 'chat-long-code');
  await confirm.tap();
  const failure = page.getByText('Демо: действие недоступно.', { exact: true });
  await expect(failure).toBeVisible();
  await failure.scrollIntoViewIfNeeded();
  const composerTop = await page.locator('[class*="workspace__composer"]').first().evaluate(element => element.getBoundingClientRect().top);
  expect((await failure.boundingBox())!.y + (await failure.boundingBox())!.height).toBeLessThanOrEqual(composerTop + 1);
  expect(writes).toBe(1);
  await expect(confirm).toBeEnabled();
  await capture(page, info, 'chat-action-error');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('calendar view choice survives resize and Kanban statuses are available without dragging', async ({ page }, info) => {
  await prepare(page, info);
  const width = page.viewportSize()?.width ?? 0;
  await page.goto('/workspace?section=calendar', { waitUntil: 'networkidle' });
  await expect(page.locator('main[data-view]')).toHaveAttribute('data-view', width <= 640 ? 'day' : 'week');
  await page.getByRole('button', { name: 'Неделя', exact: true }).tap();
  await page.setViewportSize({ width: 360, height: 740 });
  await expect(page.locator('main[data-view]')).toHaveAttribute('data-view', 'week');
  await page.getByRole('button', { name: 'День', exact: true }).tap();
  const timeline = page.getByRole('region', { name: 'Календарь на день', exact: true });
  await expect(timeline).toBeVisible();
  expect(await timeline.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  const calendar = page.locator('main[data-view]');
  expect(await calendar.evaluate(element => element.clientHeight <= innerHeight + 1 && getComputedStyle(element).overflowY === 'auto')).toBe(true);
  await page.mouse.move(180, 350);
  await page.mouse.wheel(0, 600);
  await expect.poll(() => calendar.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await calendar.evaluate(element => { element.scrollTop = 0; });
  await capture(page, info, 'calendar-mobile-day');
  await page.setViewportSize(info.project.use.viewport ?? { width: 390, height: 844 });
  const longTask = { ...task, title: '\u041f\u043e\u0434\u0433\u043e\u0442\u043e\u0432\u0438\u0442\u044c \u043f\u043e\u0434\u0440\u043e\u0431\u043d\u044b\u0439 \u043e\u0431\u0437\u043e\u0440 \u043f\u0440\u043e\u0435\u043a\u0442\u0430. '.repeat(5) };
  await page.route('**/api/tasks**', route => new URL(route.request().url()).pathname.replace(/\/$/, '') === '/api/tasks' ? route.fulfill({ json: [longTask] }) : route.fallback());
  await page.goto('/workspace?section=tasks', { waitUntil: 'networkidle' });
  const board = page.getByRole('region', { name: 'Доска задач', exact: true });
  const columns = board.locator(':scope > section');
  await expect(columns).toHaveCount(4);
  const contentBounds = await columns.evaluateAll(elements => elements.flatMap(column => {
    const parent = column.getBoundingClientRect();
    return [...column.querySelectorAll('article, [class*="tasks__columnEmpty"]')].map(child => {
      const box = child.getBoundingClientRect();
      return { parentTop: parent.top, parentBottom: parent.bottom, top: box.top, bottom: box.bottom };
    });
  }));
  for (const box of contentBounds) {
    expect(box.top).toBeGreaterThanOrEqual(box.parentTop - 1);
    expect(box.bottom).toBeLessThanOrEqual(box.parentBottom + 1);
  }
  if (width <= 1000) {
    const taskPage = page.locator('main').first();
    expect(await taskPage.evaluate(element => element.clientHeight <= innerHeight + 1 && getComputedStyle(element).overflowY === 'auto')).toBe(true);
    if (width <= 767) {
      await page.mouse.move(width / 2, Math.min(350, (page.viewportSize()?.height ?? 740) - 20));
      await page.mouse.wheel(0, 600);
      await expect.poll(() => taskPage.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    }
  }
  if (width <= 767) {
    const boxes = await columns.evaluateAll(elements => elements.map(element => { const r = element.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; }));
    for (let index = 1; index < boxes.length; index++) expect(boxes[index].top).toBeGreaterThanOrEqual(boxes[index - 1].bottom - 1);
    expect(boxes.every(box => box.left >= 0 && box.right <= width + 1)).toBe(true);
  }
  await columns.last().getByRole('heading').scrollIntoViewIfNeeded();
  await capture(page, info, 'tasks-status-columns');
  await page.locator('[data-task-edit="theme-task"]').tap();
  const editor = page.getByRole('dialog', { name: 'Редактирование задачи', exact: true });
  await expect(editor).toBeVisible();
  await editor.locator('#task-status').selectOption('in_progress');
  await expect(editor.locator('#task-status')).toHaveValue('in_progress');
  await capture(page, info, 'tasks-touch-status-edit');
  await page.keyboard.press('Escape');
  await expect(editor).toHaveCount(0);
});

test('nested document preview and memory sources keep only the top dialog active', async ({ page }, info) => {
  test.skip((page.viewportSize()?.width ?? 0) > 900, 'This checks the compact details drawers.');
  await prepare(page, info);
  const record = documentFixture({ id: 'mobile-nested-document', filename: 'Демо_заметки_длинное_название_'.repeat(7) + '.txt', mime_type: 'text/plain' });
  await page.route('**/api/documents**', route => new URL(route.request().url()).pathname.replace(/\/$/, '') === '/api/documents' ? route.fulfill({ json: [record] }) : route.fallback());
  await page.goto('/workspace?section=documents', { waitUntil: 'networkidle' });
  const row = page.locator('[role="button"][aria-pressed]').first();
  await row.tap();
  const details = page.getByRole('dialog', { name: 'Сведения о документе', exact: true });
  await expect(details).toBeVisible();
  const previewButton = details.getByRole('menuitem', { name: 'Просмотреть', exact: true });
  await previewButton.tap();
  const preview = page.getByRole('dialog', { name: record.filename, exact: true });
  await expect(preview).toBeVisible();
  const previewBox = await preview.boundingBox();
  expect(previewBox).not.toBeNull();
  expect(previewBox!.x).toBeGreaterThanOrEqual(0);
  expect(previewBox!.x + previewBox!.width).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1);
  expect(previewBox!.y).toBeGreaterThanOrEqual(0);
  expect(previewBox!.y + previewBox!.height).toBeLessThanOrEqual((page.viewportSize()?.height ?? 0) + 1);
  const previewClose = await preview.getByRole('button', { name: 'Закрыть просмотр', exact: true }).boundingBox();
  expect(previewClose).not.toBeNull();
  expect(previewClose!.x + previewClose!.width).toBeLessThanOrEqual(previewBox!.x + previewBox!.width + 1);
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.keyboard.press('Tab');
  expect(await preview.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await capture(page, info, 'documents-nested-preview');
  await page.keyboard.press('Escape');
  await expect(preview).toHaveCount(0);
  await expect(details).toBeVisible();
  await expect(previewButton).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(details).toHaveCount(0);
  await expect(row).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');

  await page.route(`**/api/memory/facts/${fact.id}`, route => route.fulfill({ json: fact }));
  await page.goto('/workspace?section=memory', { waitUntil: 'networkidle' });
  await page.locator('button[class*="rowMain"]').first().tap();
  const memory = page.locator('[data-memory-detail]');
  await expect(memory).toBeVisible();
  const sources = memory.getByRole('button', { name: 'Открыть источники', exact: true });
  await sources.tap();
  const picker = page.getByRole('dialog', { name: 'Добавить источник', exact: true });
  await expect(picker).toBeVisible();
  const pickerBox = await picker.boundingBox();
  expect(pickerBox).not.toBeNull();
  expect(pickerBox!.x).toBeGreaterThanOrEqual(0);
  expect(pickerBox!.x + pickerBox!.width).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1);
  expect(pickerBox!.y).toBeGreaterThanOrEqual(0);
  expect(pickerBox!.y + pickerBox!.height).toBeLessThanOrEqual((page.viewportSize()?.height ?? 0) + 1);
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.keyboard.press('Tab');
  expect(await picker.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await capture(page, info, 'memory-nested-source-picker');
  await page.keyboard.press('Escape');
  await expect(picker).toHaveCount(0);
  await expect(memory).toBeVisible();
  await expect(sources).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(memory).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
});
