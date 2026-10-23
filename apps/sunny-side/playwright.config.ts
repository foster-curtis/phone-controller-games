import { defineConfig, devices } from '@playwright/test';

// M6 adds the relay (8788) + Vite (5174) webServer entries and the specs.
export default defineConfig({
  testDir: './e2e',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
