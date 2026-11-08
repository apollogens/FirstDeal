import { test, expect, type Page, type TestInfo } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { mockThemeApi, routes } from '../theme/fixtures';

type Theme = 'light' | 'dark';

interface BoxMetric {
  x: number;
  y: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

interface RouteMetrics {
  routeKey: string;
  route: string;
  theme: Theme;
  viewport: { width: number; height: number } | null;
  mobileNavigationVisible: boolean;
  document: { clientWidth: number; scrollWidth: number; horizontalOverflow: boolean };
  heading: { found: boolean; visible: boolean; inViewport: boolean; unobstructed: boolean; box: BoxMetric | null };
  primary: { found: boolean; reachable: boolean; label: string; box: BoxMetric | null };
  sidebar: { found: boolean; visible: boolean; box: BoxMetric | null; mainLeft: number | null; closedSpaceEstimatePx: number };
  touchTargets: {
    count: number;
    below24px: number;
    below44px: number;
    examplesBelow24px: Array<{ tag: string; label: string; width: number; height: number }>;
    examplesBelow44px: Array<{ tag: string; label: string; width: number; height: number }>;
  };
  overlays: { visibleCount: number; occludedControlCount: number; items: Array<{ role: string; label: string; box: BoxMetric }> };
}

function themeFor(info: TestInfo): Theme {
  return info.project.name.endsWith('-dark') ? 'dark' : 'light';
}

async function prepare(page: Page, theme: Theme) {
  await page.context().addCookies([{ name: 'restore_access', value: 'portfolio-fixture', domain: '127.0.0.1', path: '/' }]);
  await page.addInitScript(mode => localStorage.setItem('restore-theme-mode', mode), theme);
  await mockThemeApi(page);
}

async function inspectRoute(page: Page, routeKey: string, routeUrl: string, theme: Theme): Promise<RouteMetrics> {
  const heading = page.getByRole('heading').first();
  await expect(heading).toBeVisible();
  await heading.scrollIntoViewIfNeeded();
  const initialMobileNavigationVisible = await page.getByRole('button', { name: 'Открыть меню', exact: true }).first().isVisible();
  // Probe controls separately: scrolling to a lower action may move a valid
  // non-sticky heading outside an inner scroll container.
  const initialHeading = await heading.evaluate(element => {
    const rect = element.getBoundingClientRect(); const style = getComputedStyle(element);
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return { found: true, visible: rect.width > 0 && rect.height > 0 && style.visibility === 'visible' && Number(style.opacity) > 0,
      inViewport: rect.bottom > 0 && rect.top < innerHeight,
      unobstructed: Boolean(hit && (hit === element || element.contains(hit))),
      box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom } };
  });
  const primarySelector = 'main button[class*="primary"], main button[class*="create"], main button[class*="compose"], main a[href][class*="primary"], main input[type="submit"]';
  const hasPrimary = await page.locator(primarySelector).evaluateAll(elements => {
    const candidate = elements.find(element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility === 'visible' && Number(style.opacity) > 0 && !(element instanceof HTMLButtonElement && element.disabled);
    });
    candidate?.setAttribute('data-mobile-qa-primary', 'true');
    return Boolean(candidate);
  });
  const primary = page.locator('[data-mobile-qa-primary="true"]');
  let primaryBox: BoxMetric | null = null;
  let primaryLabel = '';
  let primaryReachable = false;
  if (hasPrimary) {
    await primary.evaluate(element => element.setAttribute('data-mobile-qa-primary', 'true'));
    await primary.scrollIntoViewIfNeeded();
    const primaryState = await primary.evaluate(element => {
      const rect = element.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const top = x >= 0 && y >= 0 && x < innerWidth && y < innerHeight ? document.elementFromPoint(x, y) : null;
      const style = getComputedStyle(element);
      const visible = rect.width > 0 && rect.height > 0 && style.visibility === 'visible' && Number(style.opacity) > 0;
      const box = { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom };
      const label = element.getAttribute('aria-label') || element.textContent?.trim() || element.getAttribute('title') || '';
      return { visible, unobstructed: Boolean(top && (top === element || element.contains(top))), label, box };
    });
    primaryBox = primaryState.box;
    primaryLabel = primaryState.label;
    primaryReachable = primaryState.visible && primaryState.unobstructed;
    await primary.evaluate(element => element.removeAttribute('data-mobile-qa-primary'));
  }

  await page.evaluate(() => window.scrollTo(0, 0));
  return page.evaluate(({ routeKey: key, route: url, theme: currentTheme, headingText }) => {
    const box = (rect: DOMRect): BoxMetric => ({ x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom });
    const isVisible = (element: Element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && Number(style.opacity) > 0 && rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight;
    };
    const headingElement = [...document.querySelectorAll<HTMLElement>('h1,h2,h3,[role="heading"]')].find(element => element.textContent?.trim() === headingText);
    const headingRect = headingElement?.getBoundingClientRect() ?? null;
    const sidebar = document.querySelector<HTMLElement>('[class*="workspace__sidebar"]');
    const main = document.querySelector<HTMLElement>('main');
    const sidebarRect = sidebar?.getBoundingClientRect() ?? null;
    const mainRect = main?.getBoundingClientRect() ?? null;
    const navItems = [...document.querySelectorAll<HTMLElement>('button,a[href],input:not([type="hidden"]),select,textarea,[role="button"],[role="link"]')]
      .filter(isVisible);
    const targets = navItems.map(element => {
      const rect = element.getBoundingClientRect();
      const label = element.getAttribute('aria-label') || element.textContent?.trim() || element.getAttribute('title') || '';
      return { tag: element.tagName, label: label.slice(0, 100), width: Math.round(rect.width), height: Math.round(rect.height) };
    });
    const below24 = targets.filter(target => target.width < 24 || target.height < 24);
    const below44 = targets.filter(target => target.width < 44 || target.height < 44);
    const overlays = [...document.querySelectorAll<HTMLElement>('[role="dialog"],[role="alertdialog"],[role="listbox"],[role="menu"],[aria-modal="true"]')]
      .filter(isVisible)
      .map(element => {
        const rect = element.getBoundingClientRect();
        return { role: element.getAttribute('role') || 'modal', label: element.getAttribute('aria-label') || element.getAttribute('aria-labelledby') || '', box: box(rect) };
      });
    const occludedControlCount = navItems.filter(element => {
      const rect = element.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false;
      const top = document.elementFromPoint(x, y);
      if (!top || top === element || element.contains(top)) return false;
      const overlay = top.closest('[role="dialog"],[role="alertdialog"],[role="listbox"],[role="menu"],[aria-modal="true"]');
      return Boolean(overlay && !overlay.contains(element));
    }).length;
    const clientWidth = document.documentElement.clientWidth;
    const scrollWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    const headingVisible = Boolean(headingElement && isVisible(headingElement));
    const headingInViewport = Boolean(headingRect && headingRect.width > 0 && headingRect.height > 0 && headingRect.right > 0 && headingRect.left < innerWidth && headingRect.bottom > 0 && headingRect.top < innerHeight);
    const headingHit = headingRect ? document.elementFromPoint(headingRect.left + headingRect.width / 2, headingRect.top + headingRect.height / 2) : null;
    return {
      routeKey: key,
      route: url,
      theme: currentTheme,
      viewport: { width: innerWidth, height: innerHeight },
      document: { clientWidth, scrollWidth, horizontalOverflow: scrollWidth > clientWidth + 1 },
      heading: { found: Boolean(headingElement), visible: headingVisible, inViewport: headingInViewport, unobstructed: Boolean(headingElement && headingHit && (headingHit === headingElement || headingElement.contains(headingHit))), box: headingRect ? box(headingRect) : null },
      sidebar: {
        found: Boolean(sidebar),
        visible: Boolean(sidebar && isVisible(sidebar)),
        box: sidebarRect ? box(sidebarRect) : null,
        mainLeft: mainRect?.left ?? null,
        closedSpaceEstimatePx: sidebar && !isVisible(sidebar) && mainRect ? Math.max(0, Math.round(mainRect.left - 8)) : 0,
      },
      touchTargets: {
        count: targets.length,
        below24px: below24.length,
        below44px: below44.length,
        examplesBelow24px: below24.slice(0, 8),
        examplesBelow44px: below44.slice(0, 8),
      },
      overlays: { visibleCount: overlays.length, occludedControlCount, items: overlays },
    } satisfies Omit<RouteMetrics, 'primary' | 'mobileNavigationVisible'>;
  }, { routeKey, route: routeUrl, theme, headingText: await heading.textContent() ?? '' }).then(measured => ({
    ...measured,
    heading: initialHeading,
    mobileNavigationVisible: initialMobileNavigationVisible,
    primary: { found: hasPrimary, reachable: primaryReachable, label: primaryLabel, box: primaryBox },
  }));
}

test('mobile baseline: all routes across viewport and theme matrix', async ({ page, context, browser }, info) => {
  const theme = themeFor(info);
  const phase = process.env.MOBILE_QA_PHASE ?? 'before';
  const errors: string[] = [];
  context.setDefaultTimeout(10_000);
  await prepare(page, theme);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().includes('ws://127.0.0.1:3211/api/v1/ws')) errors.push(message.text());
  });
  const metrics: RouteMetrics[] = [];

  for (const route of routes) {
    await page.goto(route.url, { waitUntil: 'networkidle' });
    const routeHeading = page.getByRole('heading', { name: route.heading, exact: true }).first();
    await expect(routeHeading, `${route.key}: expected route heading`).toBeVisible();
    if (phase === 'after') await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map(image => image.decode().catch(() => undefined)));
    });

    const routeDir = path.resolve('../artifacts/mobile-qa', phase, route.key);
    await fs.mkdir(routeDir, { recursive: true });
    const screenshot = path.join(routeDir, `${info.project.name}.png`);
    await page.screenshot({ path: screenshot, animations: 'disabled' });
    if (route.key === 'calendar') {
      const controls = await page.locator('[class*="calendar__toolbar"], [class*="calendar__viewGroup"], [class*="calendar__controlGroup"]').evaluateAll(elements => elements.map(element => {
        const r = element.getBoundingClientRect(); const s = getComputedStyle(element);
        return { className: element.className, x: r.x, y: r.y, width: r.width, height: r.height, display: s.display, direction: s.flexDirection, basis: s.flexBasis, shrink: s.flexShrink, wrap: s.flexWrap, overflow: s.overflow };
      }));
      await fs.writeFile(path.join(routeDir, `${info.project.name}.controls.json`), JSON.stringify(controls, null, 2));
      if (phase === 'after' && (page.viewportSize()?.width ?? 1920) <= 640) {
        for (const name of ['День', 'Неделя', 'Месяц']) {
          const box = await page.getByRole('button', { name, exact: true }).boundingBox();
          expect.soft(box, `${name}: calendar view control exists`).not.toBeNull();
          if (box) {
            expect.soft(box.x, `${name}: left edge`).toBeGreaterThanOrEqual(0);
            expect.soft(box.x + box.width, `${name}: right edge`).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1);
          }
        }
      }
    }
    const metric = await inspectRoute(page, route.key, route.url, theme);
    metrics.push(metric);
    await fs.writeFile(path.join(routeDir, `${info.project.name}.json`), JSON.stringify({ ...metric, screenshot, pageErrors: errors }, null, 2));

    if (phase === 'after') {
      expect.soft(metric.document.horizontalOverflow, `${route.key}: horizontal page overflow at ${info.project.name}`).toBe(false);
      expect.soft(metric.heading.visible, `${route.key}: heading should remain visible`).toBe(true);
      expect.soft(metric.heading.unobstructed, `${route.key}: heading should not be covered by another control`).toBe(true);
      if ((page.viewportSize()?.width ?? 1920) <= 1000 && !['root', 'login'].includes(route.key)) expect.soft(metric.mobileNavigationVisible, `${route.key}: mobile navigation should be available`).toBe(true);
      if (metric.primary.found) expect.soft(metric.primary.reachable, `${route.key}: primary control should be reachable`).toBe(true);
    }
  }

  expect(errors, `Uncaught browser errors at ${info.project.name}`).toEqual([]);
  const projectDir = path.resolve('../artifacts/mobile-qa', phase, 'metrics');
  await fs.mkdir(projectDir, { recursive: true });
  await fs.writeFile(path.join(projectDir, `${info.project.name}.json`), JSON.stringify({ project: info.project.name, phase, browserVersion: browser.version(), hasTouch: info.project.use.hasTouch, isMobile: info.project.use.isMobile, routes: metrics, pageErrors: errors }, null, 2));
});
