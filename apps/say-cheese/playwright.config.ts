import { readE2EConfig } from '@pcg/game-kit/e2e';
import { defineConfig, devices } from '@playwright/test';

// E2E (BUILD_PLAN §2): its own relay (2 s player window) + Vite dev server pointed at it, on
// the ports in package.json `pcg.e2e` (unique per app, so `pnpm e2e` can run suites side by side).
// Ports 5173/8787 stay free for `pnpm dev:say-cheese`. Chromium fakes the camera (SPEC §3) so phone
// pages get a live MediaStream without a prompt.
const { relayPort: RELAY_PORT, webPort: WEB_PORT } = readE2EConfig(
  new URL('./package.json', import.meta.url),
);

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
    permissions: ['camera'],
    launchOptions: {
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    },
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
