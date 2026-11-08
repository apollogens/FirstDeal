import { defineConfig } from '@playwright/test';

const resultsDir = process.env.QA_RESULTS_DIR ?? '../artifacts/ui-qa';

export default defineConfig({
  testDir: './tests/portfolio',
  testMatch: 'precision*.spec.ts',
  workers: 1,
  timeout: 240000,
  expect: { timeout: 8000 },
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
  webServer: {
    cwd: process.env.QA_BASELINE_APP ?? process.cwd(),
    command: 'node scripts/portfolio-preview.mjs',
    url: 'http://127.0.0.1:3210',
    reuseExistingServer: false,
    timeout: 120000,
  },
});
