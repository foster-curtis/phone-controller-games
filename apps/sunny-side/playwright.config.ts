import { defineConfig, devices } from '@playwright/test';

// E2E: its own relay (8788, 2 s player window) + Vite dev server (5174) pointed at it.
// Ports 5173/8787 stay free for `pnpm dev` / `pnpm dev:lan`.
const RELAY_PORT = 8788;
const WEB_PORT = 5174;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Every spec opens a host + several phones against one relay; keep them sequential.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'list' : [['list']],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @pcg/relay start',
      url: `http://localhost:${RELAY_PORT}/healthz`,
      env: { PORT: String(RELAY_PORT), PLAYER_RECONNECT_MS: '2000' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `pnpm exec vite --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}/`,
      env: { VITE_RELAY_URL: `ws://localhost:${RELAY_PORT}` },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
