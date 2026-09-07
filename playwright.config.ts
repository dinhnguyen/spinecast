import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  // Pin the browser locale to Vietnamese: since the i18n work, an unauthenticated page
  // with no stored locale falls back to navigator.language, and headless Chromium
  // defaults that to en-US regardless of the host OS locale. Without this, every spec
  // written against the (pre-i18n) Vietnamese-by-default copy is flaky against Chromium's
  // build default rather than the app's actual target-locale behavior.
  use: { baseURL: 'http://localhost:5173', trace: 'retain-on-failure', locale: 'vi-VN' },
  webServer: { command: 'bash scripts/e2e-seed.sh && npm run dev', url: 'http://localhost:5173/api/health', reuseExistingServer: !process.env['CI'], timeout: 120_000 },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
