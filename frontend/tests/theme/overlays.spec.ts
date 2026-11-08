import { test, expect, type Page, type TestInfo } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { mockThemeApi, watchThemeRuntime } from './fixtures';
import { auditTextContrast, auditSemanticContrast } from './contrast';

test.setTimeout(30_000);
const runtimeErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => { runtimeErrors.set(page, watchThemeRuntime(page)); });
test.afterEach(({ page }) => { expect.soft(runtimeErrors.get(page)).toEqual([]); });

type Theme = 'light' | 'dark';

function projectTheme(info: TestInfo): Theme {
  return info.project.name.endsWith('-dark') ? 'dark' : 'light';
}

async function openWorkspace(page: Page, section: string, theme: Theme) {
  await page.context().addCookies([{ name: 'restore_access', value: 'theme-overlays-fixture', domain: '127.0.0.1', path: '/' }]);
  await page.addInitScript(mode => localStorage.setItem('restore-theme-mode', mode), theme);
  await mockThemeApi(page);
  await page.goto(`/workspace?section=${section}`, { waitUntil: 'networkidle' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

async function captureState(page: Page, info: TestInfo, key: string) {
  const phase = process.env.THEME_QA_PHASE ?? 'after';
  const run = process.env.THEME_QA_RUN ?? '';
  const dir = process.env.MOBILE_QA_PHASE
    ? path.resolve('../artifacts/mobile-qa', process.env.MOBILE_QA_PHASE, 'states', info.project.name)
    : path.resolve('../artifacts/theme-qa', `${phase}${run ? `-${run}` : ''}`, info.project.name, 'states');
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${key}.png`);
  await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
  const contrast = await auditTextContrast(page);
  const semantics = await auditSemanticContrast(page);
  const evidence = {
    key,
    route: page.url(),
    theme: await page.locator('html').getAttribute('data-theme'),
    viewport: page.viewportSize(),
    screenshot: file,
    contrast,
    semantics,
    violationsOnSimpleBackgrounds: contrast.filter(row => !row.complexBackground && row.ratio < row.threshold),
    complexBackgroundRows: contrast.filter(row => row.complexBackground),
  };
  await fs.writeFile(path.join(dir, `${key}.contrast.json`), JSON.stringify(evidence, null, 2));
  expect(evidence.theme).toBe(projectTheme(info));
  expect(contrast.length, `${key} should expose measurable text`).toBeGreaterThan(0);
  expect.soft(evidence.violationsOnSimpleBackgrounds, `${key} text contrast`).toEqual([]);
  expect.soft(semantics.filter(pair => pair.ratio < pair.minimum), `${key} semantic/control contrast`).toEqual([]);
  return evidence;
}

test('finance transaction dialog and category listbox keyboard focus', async ({ page }, info) => {
  const theme = projectTheme(info);
  await openWorkspace(page, 'finance', theme);
  const trigger = page.locator('[data-finance-create]');
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Новая транзакция', exact: true });
  await expect(dialog).toBeVisible();
  const category = dialog.locator('button[aria-haspopup="listbox"]').last();
  await category.focus();
  await category.press('ArrowDown');
  const listbox = page.getByRole('listbox').last();
  await expect(listbox).toBeVisible();
  await captureState(page, info, 'finance-category-listbox');
  await page.keyboard.press('Escape');
  await expect(listbox).toHaveCount(0);
  await expect(category).toBeFocused();
  await captureState(page, info, 'finance-dialog');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('calendar event modal date and time popovers retain selected foreground', async ({ page }, info) => {
  const theme = projectTheme(info);
  await openWorkspace(page, 'calendar', theme);
  const trigger = page.getByRole('button', { name: 'Новое событие', exact: true });
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  const modal = page.getByRole('dialog', { name: 'Новое событие', exact: true });
  await expect(modal).toBeVisible();
  const date = modal.getByRole('button', { name: /^Дата события:/ });
  await date.scrollIntoViewIfNeeded();
  await date.click();
  const datePopover = page.getByRole('dialog', { name: 'Дата события', exact: true });
  await expect(datePopover).toBeVisible();
  const selectedDay = datePopover.locator('button[aria-pressed="true"]');
  await expect(selectedDay).toBeVisible();
  await captureState(page, info, 'calendar-date-popover');
  await page.keyboard.press('Escape');
  await expect(datePopover).toHaveCount(0);
  await expect(date).toBeFocused();
  const start = modal.getByRole('combobox', { name: 'Начало', exact: true });
  await start.scrollIntoViewIfNeeded();
  await start.focus();
  const timePopover = page.getByRole('dialog', { name: 'Начало', exact: true });
  await expect(timePopover).toBeVisible();
  await captureState(page, info, 'calendar-time-popover');
  await timePopover.getByRole('button', { name: '10', exact: true }).focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await timePopover.getByRole('button', { name: '30', exact: true }).click();
  await expect(start).toHaveValue('11:30');
  await expect(timePopover).toHaveCount(0);
  await captureState(page, info, 'calendar-time-selected');
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
});

test('task creation drawer keeps inputs readable and accepts edits', async ({ page }, info) => {
  const theme = projectTheme(info);
  await openWorkspace(page, 'tasks', theme);
  const trigger = page.getByRole('button', { name: 'Новая задача', exact: true });
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  const drawer = page.getByRole('dialog', { name: 'Новая задача', exact: true });
  await expect(drawer).toBeVisible();
  const title = drawer.locator('#task-title');
  await title.fill('Theme overlay QA task');
  await expect(title).toHaveValue('Theme overlay QA task');
  await drawer.locator('#task-priority').selectOption('high');
  await captureState(page, info, 'tasks-new-drawer');
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
});

test('document upload dialog accepts a file selection', async ({ page }, info) => {
  const theme = projectTheme(info);
  await openWorkspace(page, 'documents', theme);
  const closeDetails = page.getByRole('button', { name: 'Закрыть сведения', exact: true });
  if (await closeDetails.isVisible()) await closeDetails.click();
  const trigger = page.getByRole('button', { name: 'Загрузить документ', exact: true });
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Загрузить документ', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.locator('input[type="file"]').setInputFiles({ name: 'theme-check.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% theme QA selection only') });
  await expect(dialog.getByText('theme-check.pdf', { exact: true })).toBeVisible();
  await captureState(page, info, 'documents-upload-dialog');
  await dialog.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test('mail inbox compose form accepts recipient subject and body', async ({ page }, info) => {
  const theme = projectTheme(info);
  await page.context().addCookies([{ name: 'restore_access', value: 'theme-overlays-fixture', domain: '127.0.0.1', path: '/' }]);
  await page.addInitScript(mode => localStorage.setItem('restore-theme-mode', mode), theme);
  await mockThemeApi(page);
  await page.goto('/mail/inbox', { waitUntil: 'networkidle' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  const trigger = page.getByRole('button', { name: 'Написать', exact: true });
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  const form = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Новое письмо', exact: true }) });
  await expect(form).toBeVisible();
  await form.getByLabel('Кому').fill('qa@example.test');
  await form.getByLabel('Тема').fill('Theme overlay check');
  await form.getByRole('textbox', { name: 'Текст письма' }).fill('Review the selected theme.');
  await captureState(page, info, 'mail-compose');
  await form.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(form).toHaveCount(0);
});

test('notifications panel opens and closes with Escape', async ({ page }, info) => {
  const theme = projectTheme(info);
  await openWorkspace(page, 'giga', theme);
  const trigger = page.getByRole('button', { name: /^Уведомления/ }).first();
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  const panel = page.getByRole('region', { name: 'Уведомления', exact: true });
  await expect(panel).toBeVisible();
  await captureState(page, info, 'notifications-panel');
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('memory context builder panel displays interactive controls', async ({ page }, info) => {
  const theme = projectTheme(info);
  await openWorkspace(page, 'memory', theme);
  const panel = page.locator('aside').filter({ has: page.getByRole('heading', { name: 'Собрать контекст', exact: true }) });
  if (await panel.isVisible()) await panel.getByRole('button', { name: 'Закрыть', exact: true }).click();
  const trigger = page.getByRole('button', { name: 'Собрать контекст', exact: true }).first();
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  await expect(panel).toBeVisible();
  const sourceLabel = panel.locator('label').filter({ has: page.getByRole('checkbox') }).first();
  await sourceLabel.click();
  await expect(panel.getByRole('checkbox').first()).not.toBeChecked();
  await sourceLabel.click();
  await expect(panel.getByRole('checkbox').first()).toBeChecked();
  await captureState(page, info, 'memory-context-panel');
  await panel.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(panel).toHaveCount(0);
});

test('history action menu and delete confirmation keep readable states', async ({ page }, info) => {
  await openWorkspace(page, 'history', projectTheme(info));
  const trigger = page.locator('[data-history-menu="theme-chat"]');
  await trigger.click();
  await expect(page.getByRole('menu')).toBeVisible();
  await captureState(page, info, 'history-action-menu');
  await page.getByRole('menuitem', { name: 'Удалить', exact: true }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Удалить чат?', exact: true });
  await expect(dialog).toBeVisible();
  await captureState(page, info, 'history-delete-confirmation');
  await dialog.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('profile edit dialog retains form focus and theme', async ({ page }, info) => {
  await openWorkspace(page, 'settings', projectTheme(info));
  await page.getByRole('button', { name: 'Изменить', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Редактировать профиль', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Имя', { exact: true }).fill('Theme QA');
  await captureState(page, info, 'settings-profile-dialog');
  await dialog.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.goto('/profile', { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: 'Безопасность', exact: true }).click();
  await page.getByRole('button', { name: 'Сменить пароль', exact: true }).click();
  const password = page.getByRole('dialog', { name: 'Сменить пароль', exact: true });
  await expect(password).toBeVisible();
  await password.getByLabel('Текущий пароль', { exact: true }).focus();
  await captureState(page, info, 'profile-password-dialog');
  await password.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(password).toHaveCount(0);
});
