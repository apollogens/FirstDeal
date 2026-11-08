import { defineConfig } from '@playwright/test';
import path from 'node:path';

const phase = process.env.THEME_QA_PHASE ?? 'after';
if (!['before', 'after'].includes(phase)) throw new Error('THEME_QA_PHASE must be before or after');
const run = process.env.THEME_QA_RUN ?? '';
if (run && !/^[a-z0-9-]+$/.test(run)) throw new Error('THEME_QA_RUN must contain lowercase letters, digits or hyphens');
const output = path.resolve('../artifacts/theme-qa', `${phase}${run ? `-${run}` : ''}`);
const sizes = [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }, { width: 1920, height: 900 }];
export default defineConfig({
  testDir: './tests/theme', workers: 1, timeout: 180_000, expect: { timeout: 10_000 }, retries: 0,
  outputDir: path.join(output, 'results'),
  reporter: [['list'], ['json', { outputFile: path.join(output, 'results.json') }]],
  projects: sizes.flatMap(viewport => (['light', 'dark'] as const).map(theme => ({ name: `${viewport.width}-${theme}`, use: { viewport, colorScheme: theme } }))),
  use: { channel: 'chrome', baseURL: 'http://127.0.0.1:3210', locale: 'ru-RU', timezoneId: 'Europe/Moscow', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'node scripts/portfolio-preview.mjs', url: 'http://127.0.0.1:3210', reuseExistingServer: false, timeout: 120_000 },
});
