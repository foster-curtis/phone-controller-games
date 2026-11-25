// Team pause (C4, FF14-fix-1; SPEC §10, §11.3, §15.6): phone A taps the top bar's pause button → the
// TV shows "Paused" naming A, phone B shows the paused card, and the sim's step count stays put (wall
// time and `advance` alike) → phone B taps Resume → the overlays go and the steps advance again. In
// combat (RD6) a pause also holds the spawn plan, the build meters and the builds. The pause menu
// (RD6-fix-1): Leave game frees a player's slot; the leader's End game sends everyone to the lobby.
import { expect } from '@playwright/test';
import {
  advance,
  closeContexts,
  freeze,
  joinPhone,
  openHost,
  phase,
  players,
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
  const ann = await joinPhone(browser, host.code, 'Ann', 'warden');
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

  // In combat (RD6): a pause holds the spawn plan, the meters and the builds; Ann's build button is
  // still lit after the resume and nothing was thrown meanwhile.
  for (const p of [ann, bob]) await p.page.locator('.screen.build .ready').click();
  await stepUntil(host, { phase: 'combat' }, 1);
  await expect(ann.page.locator('.screen.combat .round-btn.action')).not.toHaveClass(/dimmed/);
  await ann.page.locator('.screen.combat [data-pause]').click();
  await expect.poll(async () => (await stats(host)).pausedBy).toBe('Ann');
  const held = await host.page.evaluate(() => ({
    portals: window.__pcg!.portals(),
    meters: window.__pcg!.meters(),
    builds: window.__pcg!.builds(),
  }));
  await advance(host, 120);
  expect(
    await host.page.evaluate(() => ({
      portals: window.__pcg!.portals(),
      meters: window.__pcg!.meters(),
      builds: window.__pcg!.builds(),
    })),
  ).toEqual(held);
  await bob.page.locator('[data-resume]').click();
  await expect.poll(async () => (await stats(host)).pausedBy).toBeNull();
  await advance(host, 10);
  expect(await host.page.evaluate(() => window.__pcg!.builds())).toEqual([]);
  await expect(ann.page.locator('.screen.combat .round-btn.action')).not.toHaveClass(/dimmed/);
  expect(host.errors).toEqual([]);
});

test('Leave game (pause menu): the phone leaves after a confirm and its slot frees', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const host = await openHost(browser);
  await freeze(host);
  const ann = await joinPhone(browser, host.code, 'Ann', 'warden');
  const bob = await joinPhone(browser, host.code, 'Bob');
  await readyUp([ann, bob]);
  await stepUntil(host, { phase: 'build' });
  await bob.page.locator('.screen.build [data-pause]').click();
  await expect.poll(async () => (await stats(host)).pausedBy).toBe('Bob');

  // Bob isn't the leader: Leave game only. One tap opens the confirm step and sends nothing.
  await expect(bob.page.locator('.paused-layer [data-end-game]')).toBeHidden();
  await bob.page.locator('.paused-layer [data-leave]').click();
  await expect(bob.page.locator('.paused-layer')).toContainText('Leave the game?');
  expect((await players(host)).map((p) => p.name)).toEqual(['Ann', 'Bob']);
  // Cancel goes back; then leave for real.
  await bob.page.locator('.paused-layer [data-pause-cancel]').click();
  await expect(bob.page.locator('.paused-layer [data-resume]')).toBeVisible();
  await bob.page.locator('.paused-layer [data-leave]').click();
  await bob.page.locator('.paused-layer [data-pause-confirm]').click();

  // Bob's phone is back on the join screen; the party no longer holds him; the run goes on.
  await expect(bob.page.locator('.screen.join input[aria-label="Room code"]')).toBeVisible();
  await expect.poll(async () => (await players(host)).map((p) => p.name)).toEqual(['Ann']);
  await expect
    .poll(async () => (await host.page.evaluate(() => window.__pcg!.team()))?.roster.length)
    .toBe(1);
  expect(await phase(host)).toBe('build');
  await expect(ann.page.locator('.paused-layer')).toBeVisible();
  await ann.page.locator('[data-resume]').click();
  await expect.poll(async () => (await stats(host)).pausedBy).toBeNull();
  expect(host.errors).toEqual([]);
});

test('End game (pause menu): only the leader sees it; it sends the TV and every phone to the lobby', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const host = await openHost(browser);
  await freeze(host);
  const ann = await joinPhone(browser, host.code, 'Ann', 'warden');
  const bob = await joinPhone(browser, host.code, 'Bob');
  await readyUp([ann, bob]);
  await stepUntil(host, { phase: 'build' });
  for (const p of [ann, bob]) await p.page.locator('.screen.build .ready').click();
  await stepUntil(host, { phase: 'combat' }, 1);
  await ann.page.locator('.screen.combat [data-pause]').click();
  await expect.poll(async () => (await stats(host)).pausedBy).toBe('Ann');

  await expect(bob.page.locator('.paused-layer [data-end-game]')).toBeHidden();
  await ann.page.locator('.paused-layer [data-end-game]').click();
  await expect(ann.page.locator('.paused-layer')).toContainText('End the game for everyone?');
  expect(await phase(host)).toBe('combat');
  await ann.page.locator('.paused-layer [data-pause-confirm]').click();

  await expect.poll(() => phase(host)).toBe('lobby');
  await expect.poll(() => host.page.evaluate(() => window.__pcg!.screen())).toBe('lobby');
  await expect(host.page.locator('#tv-ui .paused-card')).toHaveCount(0);
  for (const p of [ann, bob]) await expect(p.page.locator('.screen.lobby')).toBeVisible();
  expect((await players(host)).map((p) => p.name)).toEqual(['Ann', 'Bob']);
  expect(host.errors).toEqual([]);
});
