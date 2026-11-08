// Explicitly run against the local portfolio fixture server; never a live account.
import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const base = 'http://127.0.0.1:3210';
const output = path.resolve('../docs/assets');
const evidence = path.resolve('../artifacts/portfolio-cleanup');
await fs.mkdir(output, { recursive: true });
await fs.mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const captures = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow' });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === base || url.origin === 'http://127.0.0.1:3211' || url.protocol === 'data:'
      ? route.continue() : route.abort('blockedbyclient');
  });
  await context.addCookies([{ name: 'restore_access', value: 'portfolio-fixture', domain: '127.0.0.1', path: '/' }]);
  const fixture = await context.request.get(`${base}/api/version`);
  expect(await fixture.json()).toMatchObject({ app_name: 'Workspace AI · Demo fixtures', environment: 'isolated demo' });
  await context.addInitScript(() => localStorage.setItem('restore-theme-mode', 'light'));
  // A screenshot-only read fixture matching MemoryFact, never a backend write.
  const stamp = '2026-11-08T09:00:00Z';
  await context.route(`${base}/api/memory/facts*`, route => route.fulfill({ json: [{
    id: 'showcase-fact', scope: 'work', subject_type: 'project', subject: 'Демо-проект «Орбита»',
    fact_type: 'project', predicate: 'планирование', value: 'Подготовить обзор исследования и согласовать следующие шаги.',
    status: 'active', confidence: 0.9, valid_from: stamp, valid_to: null, supersedes_fact_id: null,
    last_observed_at: stamp, evidence: [{ id: 'showcase-source', source_type: 'manual', source_id: 'fictional-note', source_version: null, observed_at: stamp, evidence_text: 'Вымышленная заметка для демонстрации интерфейса.', evidence_location: {} }],
  }] }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().includes('ws://127.0.0.1:3211/api/v1/ws')) errors.push(message.text());
  });
  const routes = [
    ['hero', 'giga', 'Новый чат'], ['tasks', 'tasks', 'Задачи'], ['calendar', 'calendar', 'Календарь'],
    ['documents', 'documents', 'Документы'], ['memory', 'memory', 'Память'], ['finance', 'finance', 'Финансы'],
    ['mobile', 'giga', 'Новый чат'],
  ];
  for (const [name, section, heading] of routes) {
    await page.setViewportSize(name === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 960 });
    const response = await page.goto(`${base}/workspace?section=${section}`, { waitUntil: 'networkidle' });
    expect(response.status()).toBe(200);
    await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/restore:|Restore Agent|GigaChat|ГигаЧат/i);
    if (section === 'giga') await expect(page.getByRole('heading', { name: 'Чем помочь?', exact: true })).toBeVisible();
    if (section === 'memory') await expect(page.getByText('Демо проект «Орбита»', { exact: true }).first()).toBeVisible();
    if (section === 'finance') await expect(page.getByRole('img', { name: /Расходы/ })).toContainText('10 000');
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map(image => image.decode()));
    });
    expect(await page.locator('nextjs-portal').evaluateAll(nodes => nodes.some(node => node.shadowRoot?.querySelector('[data-nextjs-dialog-overlay]')))).toBe(false);
    expect(errors).toEqual([]);
    const file = path.join(output, `${name}.png`);
    await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
    captures.push({ file: path.relative(path.resolve('..'), file), viewport: page.viewportSize(), fictional: true, section });
  }
} finally { await browser.close(); }
await fs.writeFile(path.join(evidence, 'showcase-captures.json'), JSON.stringify({ captures, scope: 'Current UI; fictional read fixtures; not live integration or golden baselines.' }, null, 2));
console.log(`Captured ${captures.length} public screenshots from fictional loopback data.`);
