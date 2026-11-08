import { documentFixture } from './fixtures';
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const user = { id: 'precision-demo', email: 'precision@example.test', full_name: 'Алексей Миров', role: 'employee', manager_id: null, timezone: 'Europe/Moscow', is_active: true };
const stamp = '2026-11-06T09:00:00+03:00';
const date = '2026-11-06';
const taskRows = [
  { id: 'precision-task-1', user_id: user.id, scope: 'work', title: 'Подготовить обзор квартала', description: 'Собрать показатели и отметить риски.', due_date: `${date}T15:00:00+03:00`, priority: 'high', status: 'todo', created_at: stamp, updated_at: stamp },
  { id: 'precision-task-2', user_id: user.id, scope: 'personal', title: 'Проверить бюджет команды', description: 'Сверить плановые расходы.', due_date: null, priority: 'medium', status: 'in_progress', created_at: stamp, updated_at: stamp },
];
const categories = [
  { id: 'precision-category-1', user_id: user.id, name: 'Исследования', type: 'expense', created_at: stamp, updated_at: stamp },
  { id: 'precision-category-2', user_id: user.id, name: 'Инструменты', type: 'expense', created_at: stamp, updated_at: stamp },
];
const transactions = categories.map((category, i) => ({ id: `precision-tx-${i}`, user_id: user.id, category_id: category.id, scope: 'work', amount: i ? '2500' : '7500', currency: 'RUB', type: 'expense', date, description: i ? 'Лицензия для макетов' : 'Исследование квартала', created_at: stamp, updated_at: stamp }));
const events = [{ id: 'precision-event-1', user_id: user.id, title: 'Планирование квартала', description: 'Обзор целей и блокеров.', scope: 'work', starts_at: stamp, ends_at: '2026-11-06T10:00:00+03:00', location: 'Переговорная 4', remind_at: '2026-11-06T08:30:00+03:00', reminder_sent_at: null, created_at: stamp, updated_at: stamp }];
const documents = [documentFixture({ id: 'precision-doc-1', filename: 'Quarterly review.pdf', file_size: 48192, mime_type: 'application/pdf', scope: 'work', status: 'ready', category: 'reports', importance: 'important', importance_reason: 'Содержит итоги периода.', summary: 'Выручка выросла на 8%; расходы на исследования составили 12%.', pages_count: 4, created_at: stamp, available_at: stamp, related_items: [] })];

const routes = [
  { key: 'root', url: '/' },
  { key: 'login', url: '/login' },
  { key: 'profile', url: '/profile' },
  { key: 'mail', url: '/mail' },
  { key: 'mail-connect', url: '/mail/connect' },
  { key: 'mail-inbox', url: '/mail/inbox' },
  ...['giga', 'finance', 'tasks', 'calendar', 'documents', 'memory', 'history', 'settings'].map(section => ({ key: section, url: `/workspace?section=${section}` })),
];
const viewports = [
  { width: 320, height: 640 }, { width: 360, height: 740 }, { width: 390, height: 844 },
  { width: 768, height: 900 }, { width: 1024, height: 900 }, { width: 1280, height: 900 }, { width: 1920, height: 900 },
];

test.beforeEach(async ({ context, page }) => {
  await context.addCookies([{ name: 'restore_access', value: 'precision-fixture', domain: '127.0.0.1', path: '/' }]);
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    let body: unknown = [];
    if (p === '/api/auth/session') body = { user };
    else if (p === '/api/version') body = { app_name: 'Workspace', version: 'qa', commit_sha: 'fixture', branch: 'local', database_revision: 'fixture', environment: 'isolated' };
    else if (p.endsWith('/unread-count')) body = { count: 2 };
    else if (p.endsWith('/summary')) body = { currency: 'RUB', income: '140000', expense: '32000', balance: '108000' };
    else if (p.endsWith('/transactions')) body = transactions;
    else if (p.endsWith('/categories')) body = categories;
    else if (p.endsWith('/goals')) body = [];
    else if (p === '/api/tasks' || p === '/api/tasks/') body = taskRows;
    else if (p === '/api/calendar/events') body = events;
    else if (p === '/api/calendar/free-slots' || p.endsWith('/connections')) body = [];
    else if (p === '/api/documents' || p === '/api/documents/') body = documents;
    else if (p === '/api/notifications' || p === '/api/notifications/') body = [];
    else if (p === '/api/mail/accounts' || p === '/api/mail/accounts/') body = [];
    else if (p === '/api/mail/messages') body = { items: [], total: 0 };
    else if (p === '/api/integrations/status') body = {};
    return route.fulfill({ json: body });
  });
});

function phase() {
  const value = process.env.QA_PHASE ?? 'after';
  if (value !== 'before' && value !== 'after') throw new Error('QA_PHASE must be before or after');
  return value;
}
const artifactRoot = path.resolve(process.env.QA_ARTIFACTS_DIR ?? '../artifacts/ui-qa');

async function waitForReadyPage(page: Page, key: string) {
  await page.waitForLoadState('networkidle', { timeout: 8000 });
  if (key === 'mail' || key === 'mail-inbox') {
    await page.waitForURL(/\/mail\/(connect|inbox)(?:\?|$)/, { timeout: 15000 });
    if (page.url().includes('/mail/connect')) await expect(page.getByRole('heading', { name: /Подключите почту/i })).toBeVisible();
    else await expect(page.locator('main h1').first()).toBeVisible();
    return;
  }
  if (key === 'mail-connect') {
    await expect(page.getByRole('heading', { name: /Подключите почту/i })).toBeVisible();
    return;
  }
  if (key === 'giga') {
    await expect(page.getByRole('heading', { name: /Чем помочь\?/i })).toBeVisible();
    await expect(page.locator('textarea').last()).toBeVisible();
    return;
  }
  if (key === 'finance') {
    await expect(page.locator('[class*="finance__summaryCard"]').first()).toBeVisible();
    await expect(page.locator('[class*="finance__summaryCard"]')).toHaveCount(3);
    await expect(page.locator('[class*="finance__summaryCard"]').first()).toContainText('140 000');
    await page.getByRole('tab', { name: 'Аналитика', exact: true }).click();
    await expect(page.locator('[class*="finance__contextInsights"] article')).toHaveCount(3);
    await capture(page, 'finance', 'context-analytics', page.viewportSize()!.width, { state: 'analytics-context' });
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      document.querySelectorAll<HTMLElement>('main, [class*="finance"]').forEach(el => { el.scrollTop = 0; });
    });
    return;
  }
  if (key === 'tasks') {
    await expect(page.getByText(taskRows[0].title, { exact: true })).toBeVisible();
    return;
  }
  if (key === 'calendar') {
    await expect(page.getByRole('heading', { name: /Календарь/i })).toBeVisible();
    const mobileDay = phase() === 'after' && (page.viewportSize()?.width ?? 1920) <= 640;
    if (phase() === 'after') await expect(page.getByRole('button', { name: mobileDay ? 'День' : 'Неделя', exact: true })).toHaveAttribute('aria-pressed', 'true');
    if (mobileDay) await expect(page.getByRole('region', { name: 'Календарь на день', exact: true })).toBeVisible();
    else await expect(page.getByRole('button', { name: /Планирование квартала/ }).first()).toBeVisible();
    return;
  }
  if (key === 'documents') {
    await expect(page.getByText(documents[0].filename, { exact: true }).first()).toBeVisible();
    return;
  }
  if (key === 'memory') await expect(page.getByRole('heading', { name: /Память/i })).toBeVisible();
  else if (key === 'history') await expect(page.locator('main h1').first()).toBeVisible();
  else await expect(page.getByRole('heading').first()).toBeVisible();
}

function pageDir(key: string) {
  return path.join(artifactRoot, key);
}

async function auditPage(page: Page) {
  return page.evaluate(() => {
    const rgb = (input: string) => {
      const match = input.match(/rgba?\(([^)]+)\)/i);
      if (!match) return null;
      const values = match[1].split(',').slice(0, 3).map(Number);
      return values.length === 3 && values.every(Number.isFinite) ? values : null;
    };
    const hueSat = (c: number[]) => {
      const [r, g, b] = c.map(n => n / 255);
      const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
      if (d === 0) return { h: 0, s: 0 };
      let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h = (h * 60 + 360) % 360;
      const l = (max + min) / 2;
      return { h, s: d / (1 - Math.abs(2 * l - 1)) };
    };
    const candidates = Array.from(document.querySelectorAll<HTMLElement>('body *'));
    const pink = candidates.flatMap(el => {
      const cs = getComputedStyle(el);
      const entries = [['color', cs.color], ['backgroundColor', cs.backgroundColor], ['borderColor', cs.borderColor], ['outlineColor', cs.outlineColor], ['fill', cs.fill], ['stroke', cs.stroke]] as const;
      return entries.flatMap(([property, value]) => {
        const c = rgb(value);
        if (!c) return [];
        const { h, s } = hueSat(c);
        if (s < 0.34 || h < 245 || h > 350) return [];
        const text = `${el.getAttribute('aria-label') ?? ''} ${el.textContent?.trim().slice(0, 80) ?? ''}`;
        const className = typeof el.className === 'string' ? el.className.slice(0, 120) : '';
        const semantic = /error|danger|destruct|delete|invalid|urgent|overdue|provider|third.?party/i.test(`${className} ${text}`);
        return [{ tag: el.tagName.toLowerCase(), className, property, value, h: Math.round(h), s: Number(s.toFixed(2)), text, semantic }];
      });
    });
    const rect = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) };
    };
    const summaryMetrics = Array.from(document.querySelectorAll<HTMLElement>('[class*="finance__summaryCard"]')).map(rect);
    const contextMetrics = Array.from(document.querySelectorAll<HTMLElement>('[class*="finance__contextInsights"] article')).map(rect);
    const composer = Array.from(document.querySelectorAll<HTMLElement>('textarea')).map(rect);
    const mobileMenuButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('button[aria-label="Открыть меню"]')).map(el => ({ visible: !!(el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden'), rect: rect(el), className: el.className }));
    const dayColumns = Array.from(document.querySelectorAll<HTMLElement>('[class*="calendar__dayColumn"]')).map(el => Math.round(el.getBoundingClientRect().width));
    return {
      viewport: { width: innerWidth, height: innerHeight },
      document: { scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight, clientWidth: document.documentElement.clientWidth },
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      financeSummaryMetricHeights: summaryMetrics.map(m => m.height),
      financeContextMetricHeights: contextMetrics.map(m => m.height),
      chatComposerRects: composer,
      mobileMenuButtons,
      calendarDayColumnWidths: dayColumns,
      pinkCandidates: pink.slice(0, 200),
      decorativePinkCount: pink.filter(item => !item.semantic).length,
    };
  });
}

async function capture(page: Page, key: string, component: string, width: number, evidence: unknown) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => Array.from(document.images).filter(image => image.getClientRects().length > 0).every(image => image.complete));
  const dir = pageDir(key);
  await fs.mkdir(dir, { recursive: true });
  const file = `${component}-${width}-${phase()}.png`;
  await page.screenshot({ path: path.join(dir, file), fullPage: true, animations: 'disabled', caret: 'initial' });
  await fs.appendFile(path.join(artifactRoot, 'manifest.jsonl'), JSON.stringify({ phase: phase(), key, route: page.url(), viewport: page.viewportSize(), screenshot: path.join(dir, file), evidence }) + '\n');
}

for (const viewport of viewports) {
  test(`precision baseline ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const pageErrors: Array<{ message: string; stack?: string }> = [];
    const consoleErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push({ message: error.message, stack: error.stack }));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    const acceptanceIssues: string[] = [];
    for (const route of routes) {
      await page.goto(route.url, { waitUntil: 'domcontentloaded' });
      await page.locator('body').waitFor({ state: 'visible' });
      await waitForReadyPage(page, route.key);
      const evidence = await auditPage(page);
      const devIssue = route.key === 'tasks' ? await page.evaluate(() => {
        const portal = document.querySelector('nextjs-portal');
        return portal?.shadowRoot?.textContent?.trim() ?? '';
      }) : '';
      await capture(page, route.key, route.key, viewport.width, { ...evidence, pageErrors: [...pageErrors], consoleErrors: [...consoleErrors], devIssue });
      if (phase() === 'after') {
        if (evidence.horizontalOverflow) acceptanceIssues.push(`${route.key}: horizontal overflow`);
        if (evidence.decorativePinkCount) acceptanceIssues.push(`${route.key}: ${evidence.decorativePinkCount} decorative pink/magenta computed colors`);
        const workspaceRoute = !['root', 'login'].includes(route.key);
        if (viewport.width <= 1000 && workspaceRoute && !evidence.mobileMenuButtons.some(button => button.visible)) acceptanceIssues.push(`${route.key}: no visible mobile navigation control at ${viewport.width}px`);
        if (viewport.width <= 640 && route.key === 'calendar' && evidence.calendarDayColumnWidths.some(width => width < 40)) acceptanceIssues.push('calendar: unreadable day column under 40px');
        if (route.key === 'finance' && evidence.financeContextMetricHeights.some(height => height > 110)) acceptanceIssues.push(`finance: context metric exceeds 110px (${evidence.financeContextMetricHeights.join(',')})`);
      }
    }

    if (viewport.width === 768) {
      const navChecks: Array<{ key: string; visibleMenu: boolean; opened: boolean; closed: boolean }> = [];
      for (const route of routes.filter(r => !['root', 'login', 'mail-inbox'].includes(r.key))) {
        await page.goto(route.url, { waitUntil: 'domcontentloaded' });
        await waitForReadyPage(page, route.key);
        const closeDetails = page.getByRole('button', { name: 'Закрыть сведения', exact: true });
        if (await closeDetails.isVisible().catch(() => false)) await closeDetails.click();
        const menu = page.getByRole('button', { name: 'Открыть меню', exact: true }).first();
        const visibleMenu = await menu.isVisible().catch(() => false);
        let opened = false, closed = false;
        if (visibleMenu) {
          await menu.click({ timeout: 4000 });
          const sidebar = page.locator('aside[class*="workspace__sidebar"]');
          opened = await sidebar.waitFor({ state: 'visible', timeout: 2000 }).then(() => true).catch(() => false);
          if (route.key === 'profile' && opened) await capture(page, 'profile', 'nav-open', viewport.width, { opened: true });
          const backdrop = page.locator('[class*="workspace__navBackdrop"]');
          const hasBackdrop = await backdrop.waitFor({ state: 'visible', timeout: 1500 }).then(() => true).catch(() => false);
          if (hasBackdrop) {
            const width = page.viewportSize()?.width ?? 768;
            await page.mouse.click(width - 2, 2);
            closed = !(await backdrop.isVisible().catch(() => false));
          }
        }
        navChecks.push({ key: route.key, visibleMenu, opened, closed });
      }
      await fs.appendFile(path.join(artifactRoot, 'tablet-navigation.jsonl'), JSON.stringify({ phase: phase(), viewport, navChecks }) + '\n');
      if (phase() === 'after') expect(navChecks.filter(item => !item.visibleMenu || !item.opened || !item.closed), 'Every workspace page at tablet width should open and close mobile navigation').toEqual([]);
      else expect(navChecks.filter(item => !item.visibleMenu).map(item => item.key), 'Record workspace pages missing the tablet navigation control').toEqual([]);
    }

    // Capture dialog geometry and dropdown keyboard behavior at each breakpoint.
    const interactions: Record<string, unknown> = {};
    for (const item of [
      { key: 'finance-dialog', url: '/workspace?section=finance', button: /Добавить транзакцию/i },
      { key: 'tasks-dialog', url: '/workspace?section=tasks', button: /Новая задача/i },
      { key: 'calendar-dialog', url: '/workspace?section=calendar', button: /Новое событие/i },
    ]) {
      try {
        await page.goto(item.url, { waitUntil: 'domcontentloaded' });
        await waitForReadyPage(page, item.key.replace('-dialog', ''));
        await page.getByRole('button', { name: item.button }).click({ timeout: 4000 });
        const dialog = page.getByRole('dialog').last();
        await dialog.waitFor({ state: 'visible', timeout: 4000 });
        await dialog.evaluate(async element => {
          await Promise.all(element.getAnimations({ subtree: true }).filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => undefined)));
        });
        interactions[item.key] = await dialog.evaluate(el => {
          const r = el.getBoundingClientRect();
          return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom), inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight };
        });
        if (phase() === 'after' && !(interactions[item.key] as { inViewport?: boolean }).inViewport) acceptanceIssues.push(`${item.key}: dialog outside viewport`);
        await capture(page, item.key, item.key, viewport.width, interactions[item.key]);
        await page.keyboard.press('Escape');
      } catch (error) {
        interactions[item.key] = { error: String(error) };
        if (phase() === 'after') acceptanceIssues.push(`${item.key}: ${String(error)}`);
      }
    }
    try {
      await page.goto('/workspace?section=finance', { waitUntil: 'domcontentloaded' });
      await waitForReadyPage(page, 'finance');
      const trigger = page.locator('button[aria-haspopup="listbox"]').first();
      await trigger.focus();
      await trigger.press('ArrowDown');
      const listbox = page.getByRole('listbox').first();
      await listbox.waitFor({ state: 'visible', timeout: 4000 });
      const menuRect = await listbox.evaluate(el => {
        const r = el.getBoundingClientRect();
        const active = document.activeElement as HTMLElement | null;
        const outline = active ? getComputedStyle(active).outlineColor : '';
        return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom), inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, active: active?.textContent?.trim() ?? '', activeOutlineColor: outline, activeOutlineStyle: active ? getComputedStyle(active).outlineStyle : '', activeOutlineWidth: active ? getComputedStyle(active).outlineWidth : '' };
      });
      await page.keyboard.press('Escape');
      interactions.dropdown = { ...menuRect, closedOnEscape: await listbox.count() === 0, triggerRestoredFocus: await trigger.evaluate(el => el === document.activeElement) };
      if (phase() === 'after') {
        if (!menuRect.inViewport) acceptanceIssues.push('dropdown: menu extends beyond viewport');
        if (await listbox.count() !== 0) acceptanceIssues.push('dropdown: Escape did not close menu');
        if (!(await trigger.evaluate(el => el === document.activeElement))) acceptanceIssues.push('dropdown: focus did not return to trigger after Escape');
      }
      await capture(page, 'dropdown-keyboard', 'dropdown-keyboard', viewport.width, interactions.dropdown);
    } catch (error) {
      interactions.dropdown = { error: String(error) };
      if (phase() === 'after') acceptanceIssues.push(`dropdown: ${String(error)}`);
    }
    await fs.appendFile(path.join(artifactRoot, 'interactions.jsonl'), JSON.stringify({ phase: phase(), viewport, interactions }) + '\n');
    if (phase() === 'after') expect(acceptanceIssues, `Precision regressions at ${viewport.width}px`).toEqual([]);
    expect(pageErrors, `Uncaught browser errors at ${viewport.width}px`).toEqual([]);
    test.info().annotations.push({ type: 'viewport', description: `${viewport.width}×${viewport.height}` });
    test.info().annotations.push({ type: 'pageCount', description: String(routes.length) });
  });
}

for (const width of [390, 1280]) {
  test(`dark theme route matrix ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.addInitScript(() => localStorage.setItem('restore-theme-mode', 'dark'));
    for (const route of routes) {
      await page.goto(route.url, { waitUntil: 'domcontentloaded' });
      await waitForReadyPage(page, route.key);
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      const evidence = await auditPage(page);
      await capture(page, route.key, `dark-${route.key}`, width, evidence);
      if (phase() === 'after') expect(evidence.horizontalOverflow, `${route.key} dark mode should not overflow at ${width}px`).toBe(false);
    }
  });
}

test('inspect visible Next development issue badge on tasks', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const consoleErrors: string[] = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.goto('/workspace?section=tasks', { waitUntil: 'domcontentloaded' });
  await waitForReadyPage(page, 'tasks');
  const before = await page.evaluate(() => Array.from(document.querySelectorAll('nextjs-portal')).map(portal => ({ text: portal.shadowRoot?.textContent ?? '', buttons: Array.from(portal.shadowRoot?.querySelectorAll('button') ?? []).map(button => ({ text: button.textContent, aria: button.getAttribute('aria-label') })) })));
  let opened = false;
  try {
    const issue = page.locator('nextjs-portal').getByRole('button', { name: 'Open issues overlay' }).first();
    if (await issue.isVisible({ timeout: 1500 })) { await issue.click(); opened = true; await page.waitForTimeout(500); }
  } catch { /* Record the portal as rendered without changing or hiding it. */ }
  const after = await page.evaluate(() => Array.from(document.querySelectorAll('nextjs-portal')).map(portal => portal.shadowRoot?.textContent ?? ''));
  const evidence = { before, opened, after, consoleErrors };
  await fs.appendFile(path.join(artifactRoot, 'next-dev-issues.jsonl'), JSON.stringify({ phase: phase(), viewport: { width: 390, height: 844 }, evidence }) + '\n');
  await capture(page, 'tasks', 'next-issue-details', 390, evidence);
});

test('route alias baseline across all widths', async ({ page }) => {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const route of routes.filter(item => ['root', 'mail-connect'].includes(item.key))) {
      await page.goto(route.url, { waitUntil: 'domcontentloaded' });
      await waitForReadyPage(page, route.key);
      await capture(page, route.key, route.key, viewport.width, await auditPage(page));
    }
  }
});

test('chat composer remains on-screen at short height', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 420 });
  await page.goto('/workspace?section=giga', { waitUntil: 'domcontentloaded' });
  await waitForReadyPage(page, 'giga');
  const composer = page.locator('textarea').last();
  const geometry = await composer.evaluate(el => {
    const r = el.getBoundingClientRect();
    return { y: Math.round(r.y), bottom: Math.round(r.bottom), height: Math.round(r.height), viewportHeight: innerHeight, onScreen: r.top >= 0 && r.bottom <= innerHeight };
  });
  await capture(page, 'giga', 'shortheight-chat-composer', 1280, geometry);
  if (phase() === 'after') expect(geometry.onScreen, 'Chat composer should stay visible at 420px height').toBe(true);
});
