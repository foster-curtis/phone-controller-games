// Team pause (C4, FF14-fix-1; SPEC §10, §11.3, §15.6): phone A taps the top bar's pause button → the
// TV shows "Paused" naming A, phone B shows the paused card, and the sim's step count stays put (wall
// time and `advance` alike) → phone B taps Resume → the overlays go and the steps advance again.
import { expect } from '@playwright/test';
import {
  advance,
  closeContexts,
  freeze,
  joinPhone,
  openHost,
  readyUp,
  stats,
  stepUntil,
  test,
} from './helpers';

test.afterEach(closeContexts);

test('any phone pauses the whole run; another phone resumes it', async ({ browser }) => {
  test.setTimeout(90_000);
  const host = await openHost(browser);
  await freeze(host);
  const ann = await joinPhone(browser, host.code, 'Ann');
  const bob = await joinPhone(browser, host.code, 'Bob');
  await readyUp([ann, bob]);
  await stepUntil(host, { phase: 'build' });
  await expect(ann.page.locator('.screen.build')).toBeVisible();

  // Ann pauses from her top bar.
  const pause = ann.page.locator('.screen.build [data-pause]');
  await expect(pause).toBeVisible();
  await pause.click();
  await expect.poll(async () => (await stats(host)).pausedBy).toBe('Ann');

  // The TV names her; Bob's phone shows the paused card with Resume; Ann's says it was her.
  await expect(host.page.locator('#tv-ui .paused-card')).toBeVisible();
  await expect(host.page.locator('#tv-ui .paused-card')).toContainText('Ann paused the run');
  await expect(bob.page.locator('.paused-layer')).toBeVisible();
  await expect(bob.page.locator('.paused-layer')).toContainText('Ann paused the run');
  await expect(ann.page.locator('.paused-layer')).toContainText('You paused the run');
  await expect(bob.page.locator('[data-pause]')).toBeHidden();

  // Frozen: neither `advance` nor wall time steps the sim.
  const frozen = await stats(host);
  await advance(host, 120);
  await host.page.evaluate(() => window.__pcg!.speed(1));
  await host.page.waitForTimeout(1000);
  const still = await stats(host);
  expect(still.steps).toBe(frozen.steps);
  expect(still.tick).toBe(frozen.tick);
  await freeze(host);

  // Bob resumes.
  await bob.page.locator('[data-resume]').click();
  await expect.poll(async () => (await stats(host)).pausedBy).toBeNull();
  await expect(host.page.locator('#tv-ui .paused-card')).toHaveCount(0);
  await expect(bob.page.locator('.paused-layer')).toBeHidden();
  await expect(ann.page.locator('.paused-layer')).toBeHidden();
  await expect(ann.page.locator('.screen.build [data-pause]')).toBeVisible();

  await advance(host, 30);
  const after = await stats(host);
  expect(after.steps).toBe(frozen.steps + 30);
  expect(after.tick).toBe(frozen.tick + 30);
  expect(host.errors).toEqual([]);
});
