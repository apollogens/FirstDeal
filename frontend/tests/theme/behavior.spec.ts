import { test, expect, type Page } from '@playwright/test';
import { mockThemeApi } from './fixtures';

async function prepare(page: Page) {
  await page.context().addCookies([{ name: 'restore_access', value: 'theme-behavior-fixture', domain: '127.0.0.1', path: '/' }]);
  await mockThemeApi(page, false);
}

async function chooseMode(page: Page, mode: 'light' | 'dark' | 'system') {
  await page.goto('/workspace?section=settings');
  // General settings is the default subsection; its theme selector is the first radio group.
  const radios = page.getByRole('radiogroup').first().getByRole('radio');
  const index = mode === 'light' ? 0 : mode === 'dark' ? 1 : 2;
  await expect(radios).toHaveCount(3);
  await radios.nth(index).click();
  await expect(radios.nth(index)).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-theme', mode === 'system' ? /^(light|dark)$/ : mode);
}

test('system mode follows OS color changes after leaving Settings', async ({ page }, info) => {
  await prepare(page);
  await page.goto('/');
  await chooseMode(page, 'system');
  await page.goto('/workspace?section=calendar');
  const initial = info.project.name.endsWith('-dark') ? 'dark' : 'light';
  const changed = initial === 'dark' ? 'light' : 'dark';
  await expect(page.locator('html')).toHaveAttribute('data-theme', initial);
  await page.emulateMedia({ colorScheme: changed });
  await expect(page.locator('html')).toHaveAttribute('data-theme', changed);
});

test('explicit theme overrides later OS color changes', async ({ page }, info) => {
  await prepare(page);
  const explicit = info.project.name.endsWith('-dark') ? 'dark' : 'light';
  await page.goto('/');
  await chooseMode(page, 'system');
  await chooseMode(page, explicit);
  await page.emulateMedia({ colorScheme: explicit === 'dark' ? 'light' : 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', explicit);
});

test('explicit theme survives refresh and a newly opened page', async ({ page, context }, info) => {
  await prepare(page);
  const explicit = info.project.name.endsWith('-dark') ? 'light' : 'dark';
  await page.goto('/');
  await chooseMode(page, explicit);
  await page.goto('/workspace?section=calendar');
  await expect(page.locator('html')).toHaveAttribute('data-theme', explicit);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', explicit);
  const second = await context.newPage();
  await mockThemeApi(second, false);
  await second.goto('/workspace?section=calendar');
  await expect(second.locator('html')).toHaveAttribute('data-theme', explicit);
  await second.close();
});

test('theme storage changes propagate to an already open tab', async ({ page, context }, info) => {
  await prepare(page);
  await page.goto('/');
  const other = await context.newPage();
  await mockThemeApi(other, false);
  await other.goto('/workspace?section=calendar');
  const target = info.project.name.endsWith('-dark') ? 'light' : 'dark';
  await chooseMode(page, target);
  await expect(other.locator('html')).toHaveAttribute('data-theme', target);
  await other.close();
});

test('theme toggle remains usable when localStorage is blocked', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: false,
      get() { throw new DOMException('Storage access is blocked', 'SecurityError'); },
    });
  });
  await prepare(page);
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('/login');
  const toggle = page.getByRole('switch').first();
  await expect(toggle).toBeVisible();
  const initial = await page.locator('html').getAttribute('data-theme');
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', initial === 'dark' ? 'light' : 'dark');
  expect(pageErrors).toEqual([]);
});

test('invalid stored mode falls back to the current system preference', async ({ page }, info) => {
  const expected = info.project.name.endsWith('-dark') ? 'dark' : 'light';
  await page.addInitScript(() => localStorage.setItem('restore-theme-mode', 'neon-invalid'));
  await prepare(page);
  await page.goto('/workspace?section=calendar');
  await expect(page.locator('html')).toHaveAttribute('data-theme', expected);
});

test('reduced motion keeps animated UI transitions effectively disabled', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await prepare(page);
  await page.goto('/workspace?section=settings');
  const durations = await page.locator('body').evaluate(body => {
    const values: number[] = [];
    for (const element of [body, ...Array.from(body.querySelectorAll('*'))]) {
      const style = getComputedStyle(element);
      for (const raw of style.transitionDuration.split(',')) {
        const value = raw.trim();
        values.push(value.endsWith('ms') ? Number.parseFloat(value) : Number.parseFloat(value) * 1000);
      }
      for (const raw of style.animationDuration.split(',')) {
        const value = raw.trim();
        values.push(value.endsWith('ms') ? Number.parseFloat(value) : Number.parseFloat(value) * 1000);
      }
    }
    return values.filter(Number.isFinite);
  });
  expect(Math.max(0, ...durations)).toBeLessThanOrEqual(0.01);
});
