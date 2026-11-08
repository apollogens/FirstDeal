import { defineConfig } from '@playwright/test';
import path from 'node:path';

const phase = process.env.MOBILE_QA_PHASE ?? 'before';
if (!['before', 'after'].includes(phase)) throw new Error('MOBILE_QA_PHASE must be before or after');

const sizes = [
  { name: '320x740', width: 320, height: 740 },
  { name: '360x800', width: 360, height: 800 },
  { name: '390x844', width: 390, height: 844 },
  { name: '430x932', width: 430, height: 932 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1024x768', width: 1024, height: 768 },
  { name: '1280x800', width: 1280, height: 800 },
  { name: 'landscape-844x390', width: 844, height: 390 },
];

const output = path.resolve('../artifacts/mobile-qa', phase);

export default defineConfig({
  testDir: './tests',
  testMatch: ['**/mobile/*.spec.ts', '**/theme/overlays.spec.ts'],
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 10_000 },
  retries: 0,
  outputDir: path.join(output, 'results'),
  reporter: [['list'], ['json', { outputFile: path.join(output, 'results.json') }]],
  projects: sizes.flatMap(size => (['light', 'dark'] as const).map(theme => ({
    name: `${size.name}-${theme}`,
    use: {
      viewport: { width: size.width, height: size.height },
      colorScheme: theme,
      hasTouch: true,
      isMobile: size.width <= 768 || size.name.startsWith('landscape'),
    },
  }))),
  use: {
    channel: 'chrome',
    baseURL: 'http://127.0.0.1:3210',
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/portfolio-preview.mjs',
    url: 'http://127.0.0.1:3210',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
