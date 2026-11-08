import { test, expect, type Page, type Response, type TestInfo } from '@playwright/test';
import fs from 'node:fs/promises';
import type { Request } from '@playwright/test';

const mode = process.env.PORTFOLIO_QA_MODE ?? 'development';
const fixtureSocket = 'ws://127.0.0.1:3211/api/v1/ws';
const routes = [
  { key: 'profile', url: '/profile', heading: 'Личный кабинет' },
  { key: 'chat', url: '/workspace?section=giga', heading: 'Новый чат', sidebar: 'Assistant' },
  { key: 'calendar', url: '/workspace?section=calendar', heading: 'Календарь', sidebar: 'Календарь' },
  { key: 'finance', url: '/workspace?section=finance', heading: 'Финансы', sidebar: 'Финансы' },
  { key: 'documents', url: '/workspace?section=documents', heading: 'Документы', sidebar: 'Документы' },
  { key: 'memory', url: '/workspace?section=memory', heading: 'Память', sidebar: 'Память' },
  { key: 'tasks', url: '/workspace?section=tasks', heading: 'Задачи', sidebar: 'Задачи' },
];
type Route = typeof routes[number];
type Incident = { type: string; url: string; message: string; expected: boolean; resourceType?: string; responseStatus?: number };

function pathname(url: string) {
  try { return new URL(url).pathname.replace(/\/$/, '') || '/'; } catch { return ''; }
}

function audit(page: Page) {
  const incidents: Incident[] = [];
  const responses: Array<{ url: string; status: number }> = [];
  const responseStatuses = new Map<Request, number>();
  page.on('pageerror', error => incidents.push({ type: 'pageerror', url: page.url(), message: error.stack ?? error.message, expected: false }));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const url = message.location().url;
    const text = message.text();
    const expectedSocket = text.includes(fixtureSocket) && /WebSocket.*(handshake|response code|closed before)/i.test(text);
    incidents.push({ type: 'console.error', url, message: text, expected: expectedSocket });
  });
  page.on('requestfailed', request => {
    // Navigation may cancel API reads or the remainder of a successful RSC
    // stream after rendering. Preserve these incidents; scripts, documents,
    // RSC requests without a successful response and other errors still fail.
    const error = request.failure()?.errorText ?? 'Unknown request failure';
    const responseStatus = responseStatuses.get(request);
    const cancelledRsc = request.resourceType() === 'fetch' && !request.isNavigationRequest() &&
      request.headers().rsc === '1' && new URL(request.url()).searchParams.has('_rsc') && responseStatus === 200;
    const expected = error === 'net::ERR_ABORTED' && (pathname(request.url()).startsWith('/api/') || cancelledRsc);
    incidents.push({ type: 'requestfailed', url: request.url(), message: error, expected, resourceType: request.resourceType(), responseStatus });
  });
  page.on('websocket', socket => socket.on('socketerror', error => {
    incidents.push({ type: 'websocket', url: socket.url(), message: error, expected: socket.url() === fixtureSocket });
  }));
  page.on('response', response => {
    responseStatuses.set(response.request(), response.status());
    responses.push({ url: response.url(), status: response.status() });
    // Redirects and cache revalidation are normal HTTP outcomes; document SSR is
    // checked separately for an actual 200 response and the expected route HTML.
    if (response.status() >= 200 && response.status() < 400) return;
    incidents.push({ type: 'http', url: response.url(), message: `HTTP ${response.status()}`, expected: false });
  });
  return {
    incidents,
    async save(info: TestInfo) {
      const result = {
        mode, fixture: true,
        scope: 'SSR, hydration, direct refresh and client navigation through real Next proxies to fictional loopback data; external integrations and mutations are not validated.',
        boundaryReview: 'No custom app error.tsx/global-error.tsx was found during source review; this test observes normal routes and Next default errors, without injecting a synthetic successful recovery.',
        responses, incidents,
      };
      const file = info.outputPath('runtime-audit.json');
      await fs.writeFile(file, JSON.stringify(result, null, 2));
      await info.attach('runtime-audit', { path: file, contentType: 'application/json' });
    },
    async assertHealthy() {
      expect(incidents.filter(item => !item.expected), 'Unexpected console, HTTP, chunk or uncaught browser errors; inspect runtime-audit.json').toEqual([]);
    },
  };
}

async function assertSsr(response: Response | null, route: Route) {
  expect(response, `Missing document response: ${route.url}`).not.toBeNull();
  if (!response) throw new Error(`Missing document response: ${route.url}`);
  expect(response.status(), `SSR ${route.url}`).toBe(200);
  const html = await response.text();
  // Check the actual document body, not client-side API mocks or a later hydrated heading.
  expect(html).toContain('Алекс Миров · Демо');
  expect(html, `Server-rendered heading for ${route.url}`).toContain(`>${route.heading}</h1>`);
}

async function ready(page: Page, route: Route) {
  await expect(page.getByRole('heading', { name: route.heading, exact: true }).first()).toBeVisible();
  await expect(page.locator('aside').first()).toBeVisible();
  await expect(page.getByText('Алекс Миров · Демо', { exact: true }).first()).toBeVisible();
  if (route.key === 'chat') {
    await expect(page.getByRole('heading', { name: 'Чем помочь?', exact: true })).toBeVisible();
    await expect(page.locator('textarea').last()).toBeVisible();
  } else if (route.key === 'calendar') {
    await expect(page.getByRole('button', { name: /Обзор проекта «Орбита»/ }).first()).toBeVisible();
  } else if (route.key === 'finance') {
    await expect(page.getByRole('img', { name: /Расходы/ })).toContainText('10 000');
    await expect(page.getByText('Исследования', { exact: true }).first()).toBeVisible();
  } else if (route.key === 'documents') {
    await expect(page.getByText('Орбита — план исследования (демо).pdf', { exact: true }).first()).toBeVisible();
  } else if (route.key === 'tasks') {
    await expect(page.getByRole('heading', { name: 'Подготовить обзор проекта «Орбита»', exact: true })).toBeVisible();
  } else if (route.key === 'memory') {
    await expect(page.getByText('Загружаем память…', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Воспоминания не найдены.', { exact: true })).toBeVisible();
  } else if (route.key === 'profile') {
    await expect(page.getByRole('textbox', { name: 'Имя', exact: true })).toHaveValue('Алекс Миров · Демо');
  }
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.decode().catch(() => undefined)));
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
}

async function capture(page: Page, info: TestInfo, route: Route, phase: string) {
  const file = info.outputPath(`${route.key}-${phase}.png`);
  await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
  await info.attach(`${route.key}-${phase}`, { path: file, contentType: 'image/png' });
}

test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: 'restore_access', value: 'portfolio-fixture', domain: '127.0.0.1', path: '/' }]);
});

test('browser favicon fallback resolves the existing application icon', async ({ request }) => {
  const response = await request.get('/favicon.ico');
  expect(response.status()).toBe(200);
  expect(new URL(response.url()).pathname).toBe('/icon.svg');
  expect(response.headers()['content-type']).toContain('image/svg+xml');
  expect(await response.text()).toContain('<svg');
});

test('document proxy preserves bytes from a compressed fictional upstream download', async ({ context }) => {
  const response = await context.request.get('/api/documents/demo-doc-1/download');
  expect(response.status()).toBe(200);
  const bytes = await response.body();
  expect([...bytes]).toEqual([0, 1, 2, 127, 128, 255]);
  expect(response.headers()['content-type']).toContain('application/octet-stream');
  expect(response.headers()['content-disposition']).toContain('fixture.bin');
  const length = response.headers()['content-length'];
  if (length !== undefined) expect(Number(length)).toBe(bytes.length);
});

for (const route of routes) {
  test(`${route.key}: SSR direct navigation and refresh`, async ({ page }, info) => {
    const runtime = audit(page);
    try {
      await assertSsr(await page.goto(route.url, { waitUntil: 'load' }), route);
      await ready(page, route);
      await capture(page, info, route, 'direct');
      await assertSsr(await page.reload({ waitUntil: 'load' }), route);
      await ready(page, route);
      await capture(page, info, route, 'refresh');
      await runtime.assertHealthy();
    } finally { await runtime.save(info); }
  });
}

test('sidebar client navigation loads each requested screen', async ({ page }, info) => {
  const runtime = audit(page);
  try {
    await page.goto('/profile');
    await ready(page, routes[0]);
    for (const route of routes.filter(item => item.sidebar)) {
      await page.locator('aside').first().getByRole('button', { name: route.sidebar, exact: true }).click();
      await expect.poll(() => new URL(page.url()).searchParams.get('section') ?? 'giga').toBe(route.key === 'chat' ? 'giga' : route.key);
      await ready(page, route);
      await capture(page, info, route, 'sidebar');
    }
    await runtime.assertHealthy();
  } finally { await runtime.save(info); }
});
