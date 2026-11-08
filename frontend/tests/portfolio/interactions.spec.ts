import { documentFixture } from './fixtures';
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';

const user = { id: 'qa-demo', email: 'qa@example.test', full_name: 'QA Demo', role: 'employee', manager_id: null, timezone: 'Europe/Moscow', is_active: true };
const task = { id: 'task-1', user_id: user.id, scope: 'work', title: 'Prepare quarterly report', description: 'Collect finance data', due_date: null, priority: 'high', status: 'todo', created_at: '2026-11-01T09:00:00Z', updated_at: '2026-11-01T09:00:00Z' };
const doc = documentFixture({ id: 'doc-1', filename: 'Quarterly report.pdf', file_size: 48192, mime_type: 'application/pdf', scope: 'work', status: 'ready', category: 'reports', importance: 'important', importance_reason: 'Contains quarterly results', summary: 'Revenue and expense overview.', pages_count: 4, created_at: '2026-11-01T09:00:00Z', available_at: '2026-11-01T09:00:00Z', related_items: [] });
const event = { id: 'event-1', user_id: user.id, title: 'Planning', description: 'Weekly planning', scope: 'work', starts_at: '2026-11-06T09:00:00+03:00', ends_at: '2026-11-06T10:00:00+03:00', location: 'Room 4', remind_at: '2026-11-06T08:30:00+03:00', reminder_sent_at: null, created_at: '2026-11-01T09:00:00Z', updated_at: '2026-11-01T09:00:00Z' };

test.beforeEach(async ({ context, page }) => {
  await context.addCookies([{ name: 'restore_access', value: 'qa-fixture', domain: '127.0.0.1', path: '/' }]);
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let body: unknown = [];
    if (path === '/api/auth/session') body = { user };
    else if (path.endsWith('/summary')) body = { currency: 'RUB', income: '120000', expense: '45000', balance: '75000' };
    else if (path.endsWith('/unread-count')) body = { count: 1 };
    else if (path === '/api/notifications') body = [];
    else if (path === '/api/tasks' && route.request().method() === 'GET') body = [task];
    else if (path === '/api/documents' && route.request().method() === 'GET') body = [doc];
    else if (path === '/api/calendar/events' && route.request().method() === 'GET') body = [event];
    else if (path === '/api/calendar/free-slots') body = [];
    else if (path === '/api/mail/accounts') body = [];
    else if (path === '/api/mail/messages') body = { items: [], total: 0 };
    else if (path === '/api/integrations/status') body = {};
    else if (path.includes('/connect/')) return route.fulfill({ status: 503, json: { message: 'Provider unavailable (QA fixture)' } });
    else if (path === '/api/tasks/task-1' && route.request().method() === 'PATCH') return route.fulfill({ status: 503, json: { message: 'Save failed (QA fixture)' } });
    else if (path === '/api/version') body = { version: 'qa' };
    return route.fulfill({ json: body });
  });
});

async function capture(page: Page, name: string, project: string) {
  await page.evaluate(() => document.fonts.ready);
  const phase = process.env.QA_PHASE ?? 'after';
  const dir = process.env.QA_ARTIFACTS_DIR ?? `../artifacts/qa/${phase}`;
  await fs.mkdir(dir, { recursive: true });
  const path = `${dir}/interaction-${name}-${project}.png`;
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
  await fs.appendFile(`${dir}/manifest.jsonl`, JSON.stringify({ route: page.url(), viewport: page.viewportSize(), screenshot: path, fixture: true, captured: true }) + '\n');
}

test('tasks search and failed edit remain reviewable', async ({ page }, info) => {
  await page.goto('/workspace?section=tasks');
  await page.getByRole('searchbox', { name: /поиск по задачам/i }).fill('quarterly');
  await expect(page.getByText(task.title)).toBeVisible();
  await page.getByRole('button', { name: /редактировать задачу/i }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/название/i).fill('Updated quarterly report');
  await dialog.getByRole('button', { name: /сохранить изменения/i }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/save failed|не удалось|ошибк/i)).toBeVisible();
  await capture(page, 'task-save-error', info.project.name);
});

test('calendar period navigation and event form are usable', async ({ page }, info) => {
  await page.goto('/workspace?section=calendar');
  const range = page.locator('[class*=calendar__range]').first();
  const before = await range.innerText();
  await page.getByRole('button', { name: 'Следующий период' }).click();
  await expect(range).not.toHaveText(before);
  await page.getByRole('button', { name: 'Предыдущий период' }).click();
  await expect(range).toHaveText(before);
  await page.getByRole('button', { name: /создать событие|новое событие|добавить событие/i }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await capture(page, 'calendar-create', info.project.name);
});

test('documents select a realistic record and expose its details', async ({ page }, info) => {
  await page.goto('/workspace?section=documents');
  const documentRow = page.locator('[role="button"][aria-pressed]').filter({ hasText: doc.filename });
  await expect(documentRow).toBeVisible();
  const closeDetails = page.getByRole('button', { name: 'Закрыть сведения', exact: true });
  if ((page.viewportSize()?.width ?? 1920) <= 900) await expect(closeDetails).toHaveCount(0);
  else await closeDetails.click();
  await documentRow.click();
  await expect(page.getByText(/Revenue and expense overview\./i)).toBeVisible();
  await capture(page, 'document-details', info.project.name);
});

test('calendar existing event opens an editable drawer without saving', async ({ page }, info) => {
  let writes = 0;
  page.on('request', request => {
    if (request.url().includes('/api/calendar/events') && request.method() !== 'GET') writes++;
  });
  await page.goto('/workspace?section=calendar');
  await page.getByRole('button', { name: 'Неделя', exact: true }).click();
  await page.getByRole('button', { name: /Planning/ }).first().click();
  await page.getByRole('button', { name: 'Изменить', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Изменить событие' })).toBeVisible();
  await expect(dialog.getByLabel('Название *', { exact: true })).toHaveValue(event.title);
  await dialog.getByLabel('Название *', { exact: true }).fill('Planning revised');
  expect(writes).toBe(0);
  await capture(page, 'calendar-edit', info.project.name);
  await dialog.getByRole('button', { name: 'Закрыть окно' }).click();
  expect(writes).toBe(0);
});

test('chat composer accepts text and offers send action', async ({ page }, info) => {
  await page.goto('/workspace?section=giga');
  const composer = page.locator('textarea').last();
  await composer.fill('Summarize my next actions');
  await expect(page.getByRole('button', { name: /отправить|send/i })).toBeEnabled();
  await capture(page, 'chat-composer', info.project.name);
});

test('mail provider failure remains visible', async ({ page }, info) => {
  await page.goto('/mail/connect');
  await page.getByRole('button', { name: /подключить gmail/i }).click();
  await expect(page.getByRole('alert').filter({ hasText: /provider unavailable|не удалось/i })).toBeVisible();
  await capture(page, 'mail-connect-error', info.project.name);
});

test('settings navigation and theme choice persist', async ({ page }, info) => {
  await page.goto('/workspace?section=settings');
  await page.getByRole('button', { name: /уведомления/i }).click();
  await expect(page.locator('nav[aria-label="Разделы настроек"] [aria-current="page"]')).toContainText(/уведомления/i);
  await page.getByRole('button', { name: /общие/i }).click();
  await page.getByRole('radio', { name: 'Тёмная' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await capture(page, 'settings-dark', info.project.name);
  await page.getByRole('radio', { name: 'Светлая' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await capture(page, 'settings-theme', info.project.name);
});

test('notifications Escape closes and restores focus', async ({ page }, info) => {
  await page.goto('/workspace');
  const trigger = page.getByRole('button', { name: /уведомления/i }).first();
  await trigger.focus();
  await trigger.press('Enter');
  await expect(page.getByRole('region', { name: /уведомления/i })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: /уведомления/i })).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await capture(page, 'notifications-escape', info.project.name);
});
