import { defineConfig } from '@playwright/test';

const resultsDir = process.env.QA_RESULTS_DIR ?? '../artifacts/qa';

export default defineConfig({
  testDir: './tests/portfolio',
  testIgnore: 'precision*.spec.ts',
  workers: 1,
  timeout: 30000,
  outputDir: `${resultsDir}/results`,
  reporter: [['list'], ['json', { outputFile: `${resultsDir}/results.json` }]],
  use: {
    channel: 'chrome',
    baseURL: 'http://127.0.0.1:3210',
    timezoneId: 'Europe/Moscow',
    locale: 'ru-RU',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1920, height: 900 } } },
    { name: 'laptop', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: 'node scripts/portfolio-preview.mjs',
    url: 'http://127.0.0.1:3210',
    reuseExistingServer: false,
    timeout: 120000,
  },
});
