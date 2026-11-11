import { readE2EConfig } from '@pcg/game-kit/e2e';
import { defineConfig, devices } from '@playwright/test';

// E2E (BUILD_PLAN G1): the Vite dev server alone on the gallery's `pcg.e2e` webPort. The gallery has
// no relay; its relayPort is reserved only because the e2e runner requires one per app.
const { webPort: WEB_PORT } = readE2EConfig(new URL('./package.json', import.meta.url));

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  // Focus, theme and animation checks are timing-sensitive; one page at a time keeps them steady.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm exec vite --port ${WEB_PORT} --strictPort`,
    url: `http://localhost:${WEB_PORT}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
