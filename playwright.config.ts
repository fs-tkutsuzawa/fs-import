import { defineConfig } from '@playwright/test';

const ts = (() => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
})();

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: [
    ['list'],
    [
      'html',
      { outputFolder: `docs/test-artifacts/runs/${ts}/report`, open: 'never' },
    ],
  ],
  outputDir: `docs/test-artifacts/runs/${ts}/output`,
  use: {
    baseURL: process.env.FRONTEND_URL || 'http://localhost:3000',
    video: 'on',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    viewport: { width: 1280, height: 800 },
  },
});
