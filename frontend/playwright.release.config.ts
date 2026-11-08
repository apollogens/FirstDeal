import { defineConfig } from '@playwright/test';
import path from 'node:path';

const mode = process.env.PORTFOLIO_QA_MODE ?? 'development';
if (!['development', 'cold-development', 'production'].includes(mode)) {
  throw new Error(`Unsupported PORTFOLIO_QA_MODE: ${mode}`);
}
const evidence = path.resolve(process.env.RELEASE_QA_ARTIFACTS_DIR ?? '../artifacts/release-remediation', `cold-${mode}${process.env.RELEASE_QA_RUN ? `-${process.env.RELEASE_QA_RUN}` : ''}`);

export default defineConfig({
  testDir: './tests/release',
  testMatch: 'cold-start.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  outputDir: path.join(evidence, 'results'),
  reporter: [['list'], ['json', { outputFile: path.join(evidence, 'results.json') }]],
  use: {
    channel: 'chrome',
    baseURL: 'http://127.0.0.1:3210',
    viewport: { width: 1440, height: 1000 },
    timezoneId: 'Europe/Moscow',
    locale: 'ru-RU',
    navigationTimeout: 90_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chrome' }],
  // This command owns BOTH 3210 (Next) and 3211 (fictional backend).
  // Run modes sequentially; never reuse a server from a different mode/build.
  webServer: {
    command: 'node scripts/portfolio-preview.mjs',
    url: 'http://127.0.0.1:3210/api/version',
    reuseExistingServer: false,
    timeout: 180_000,
    env: { PORTFOLIO_QA_MODE: mode },
  },
});
