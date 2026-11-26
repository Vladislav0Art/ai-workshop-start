// The web view's integration tests: the real page in Chromium, GitHub answered by recordings.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/web',
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:5173' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npx vite --config web/vite.config.ts',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
