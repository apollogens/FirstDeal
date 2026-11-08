import { test, expect, type Page, type TestInfo } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { mockThemeApi, routes, watchThemeRuntime } from '../theme/fixtures';

type Theme = 'light' | 'dark';
test.setTimeout(60_000);
const runtimeErrors = new WeakMap<Page, string[]>();

test.beforeEach(({ page }) => {
  runtimeErrors.set(page, watchThemeRuntime(page));
  test.skip((process.env.MOBILE_QA_PHASE ?? 'before') !== 'after', 'Mobile interaction acceptance checks run in the after phase.');
  page.setDefaultTimeout(10_000);
});
test.afterEach(({ page }) => { expect.soft(runtimeErrors.get(page) ?? []).toEqual([]); });

function currentTheme(info: TestInfo): Theme {
  return info.project.name.endsWith('-dark') ? 'dark' : 'light';
}

function skipWithoutMobileNavigation(info: TestInfo) {
  const width = Number(info.project.name.match(/^\d+/)?.[0] ?? 0);
  test.skip(width > 1000, 'The mobile navigation trigger is not rendered above 1000px.');
}

async function prepare(page: Page, route: string, theme: Theme) {
  await page.context().addCookies([{ name: 'restore_access', value: 'portfolio-fixture', domain: '127.0.0.1', path: '/' }]);
  await page.addInitScript(mode => localStorage.setItem('restore-theme-mode', mode), theme);
  await mockThemeApi(page);
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

async function captureState(page: Page, info: TestInfo, key: string) {
  const dir = path.resolve('../artifacts/mobile-qa/after/states', info.project.name);
  await fs.mkdir(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${key}.png`), animations: 'disabled' });
}

async function openMobileMenu(page: Page) {
  const trigger = page.getByRole('button', { name: 'Открыть меню', exact: true });
  await expect(trigger).toBeVisible();
  await trigger.tap();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const controlledId = await trigger.getAttribute('aria-controls');
  expect(controlledId, 'menu trigger should reference its controlled navigation').toBeTruthy();
  const menu = page.locator(`#${controlledId}`);
  await expect(menu).toBeVisible();
  return { trigger, menu };
}

test('touch navigation menu traps focus, closes on Escape and restores focus', async ({ page }, info) => {
  skipWithoutMobileNavigation(info);
  await prepare(page, '/workspace?section=tasks', currentTheme(info));
  const { trigger, menu } = await openMobileMenu(page);
  const focusable = menu.locator('button:not([disabled]):visible, a[href]:visible, input:not([disabled]):visible, [tabindex="0"]:visible');
  const count = await focusable.count();
  expect(count, 'open navigation should expose keyboard controls').toBeGreaterThan(1);
  const first = focusable.first();
  const last = focusable.last();
  await first.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(last).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(first).toBeFocused();
  await captureState(page, info, 'mobile-menu-open');
  await page.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  await captureState(page, info, 'mobile-menu-closed');
});

test('touch navigation reaches every major workspace section', async ({ page }, info) => {
  skipWithoutMobileNavigation(info);
  const theme = currentTheme(info);
  await prepare(page, '/workspace?section=giga', theme);
  const sections = [
    { name: 'Assistant', routeKey: 'chat' },
    { name: 'Финансы', routeKey: 'finance' },
    { name: 'Почта', routeKey: 'mail' },
    { name: 'Календарь', routeKey: 'calendar' },
    { name: 'Задачи', routeKey: 'tasks' },
    { name: 'Документы', routeKey: 'documents' },
    { name: 'Память', routeKey: 'memory' },
    { name: 'Все чаты', routeKey: 'history' },
    { name: 'Настройки', routeKey: 'settings' },
  ] as const;

  for (const section of sections) {
    const { menu } = await openMobileMenu(page);
    await menu.getByRole('button', { name: section.name, exact: true }).tap();
    const expected = routes.find(route => route.key === section.routeKey);
    expect(expected, `theme fixture should define ${section.routeKey}`).toBeDefined();
    await expect(page.getByRole('heading', { name: expected!.heading, exact: true }).first()).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  }

  const { menu: profileMenu } = await openMobileMenu(page);
  await profileMenu.getByRole('button', { name: 'Профиль пользователя', exact: true }).tap();
  await page.getByRole('menuitem', { name: /Мой профиль/ }).tap();
  const profile = routes.find(route => route.key === 'profile');
  expect(profile).toBeDefined();
  await expect(page.getByRole('heading', { name: profile!.heading, exact: true }).first()).toBeVisible();
  await captureState(page, info, 'navigation-profile');
});

test('documents list opens and closes details without an automatic upload drawer', async ({ page }, info) => {
  test.skip((page.viewportSize()?.width ?? 0) > 900, 'Wide layouts keep the existing document details column.');
  await prepare(page, '/workspace?section=documents', currentTheme(info));
  const rows = page.locator('[role="button"][aria-pressed]');
  await expect(rows.first()).toBeVisible();
  const details = page.locator('aside[class*="panel"]');
  const upload = page.getByRole('dialog', { name: 'Загрузить документ', exact: true });
  await expect(details).toHaveCount(0);
  await expect(upload).toHaveCount(0);
  await rows.first().tap();
  await expect(details).toBeVisible();
  await captureState(page, info, 'documents-details-open');
  await details.getByRole('button').first().tap();
  await expect(details).toHaveCount(0);

  const uploadTrigger = page.getByRole('button', { name: 'Загрузить документ', exact: true }).first();
  await uploadTrigger.scrollIntoViewIfNeeded();
  await uploadTrigger.tap();
  await expect(upload).toBeVisible();
  await upload.locator('input[type="file"]').setInputFiles({ name: 'mobile-selection.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% fixture selection') });
  await expect(upload.getByText('mobile-selection.pdf', { exact: true })).toBeVisible();
  await captureState(page, info, 'documents-upload-selected');
  await upload.getByRole('button', { name: 'Закрыть', exact: true }).tap();
  await expect(upload).toHaveCount(0);
});

test('memory list opens the context builder only on request and closes it', async ({ page }, info) => {
  test.skip((page.viewportSize()?.width ?? 0) > 1000, 'Wide layouts keep the existing context builder column.');
  await prepare(page, '/workspace?section=memory', currentTheme(info));
  await expect(page.getByRole('heading', { name: 'Память', exact: true })).toBeVisible();
  const panel = page.locator('aside[class*="panel"]');
  await expect(panel).toBeHidden();
  const build = page.getByRole('button', { name: 'Собрать контекст', exact: true });
  await build.scrollIntoViewIfNeeded();
  await build.tap();
  await expect(panel).toBeVisible();
  const checkboxes = panel.getByRole('checkbox');
  await expect(checkboxes.first()).toBeVisible();
  await captureState(page, info, 'memory-context-builder');
  await panel.getByRole('button').last().tap();
  await expect(panel).toHaveCount(0);
  await expect(build).toBeVisible();
});

test('chat draft survives viewport resize and composer remains reachable on a short screen', async ({ page }, info) => {
  await prepare(page, '/workspace?section=giga', currentTheme(info));
  const composer = page.getByRole('textbox', { name: 'Сообщение', exact: true });
  await expect(composer).toBeVisible();
  const draft = 'Mobile layout check: keep this unsent draft while resizing.';
  await composer.fill(draft);
  await page.setViewportSize({ width: 320, height: 640 });
  await expect(composer).toHaveValue(draft);
  await composer.scrollIntoViewIfNeeded();
  const send = page.getByRole('button', { name: 'Отправить сообщение', exact: true });
  await send.scrollIntoViewIfNeeded();
  await expect(send).toBeVisible();
  await expect(send).toBeEnabled();
  const geometry = await send.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const hit = x >= 0 && y >= 0 && x < innerWidth && y < innerHeight ? document.elementFromPoint(x, y) : null;
    return { inViewport: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight, unobstructed: Boolean(hit && (hit === element || element.contains(hit))) };
  });
  expect(geometry.inViewport).toBe(true);
  expect(geometry.unobstructed).toBe(true);
  await page.setViewportSize({ width: 320, height: 390 });
  await expect(composer).toHaveValue(draft);
  await expect(page.locator('main').first()).toHaveCSS('overflow-y', 'auto');
  await send.scrollIntoViewIfNeeded();
  const shortBox = await send.boundingBox();
  expect(shortBox).not.toBeNull();
  expect(shortBox!.y + shortBox!.height).toBeLessThanOrEqual(390);
  await expect(composer).toHaveValue(draft);
  await captureState(page, info, 'chat-composer-short-viewport');
});
