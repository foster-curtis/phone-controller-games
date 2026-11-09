// SC8 audio (BUILD_PLAN §3 SC8; SPEC §6.8): Sound on unlocks the TV's audio, and a round plays its
// sounds without console errors.
import type { Page } from '@playwright/test';
import {
  cameraAndReady,
  closeContexts,
  expect,
  hostPhase,
  joinPlayer,
  openHost,
  photographerOf,
  screen,
  test,
  type Phone,
} from './helpers';

test.afterEach(closeContexts);
test.setTimeout(120_000);

const unlocked = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __pcg: { sfxUnlocked(): boolean } }).__pcg.sfxUnlocked(),
  );

test('Sound on unlocks the host and a round plays without errors', async ({ browser }) => {
  const host = await openHost(browser, 'debug=1&timeScale=0.1');
  const errors: string[] = [];
  host.page.on('pageerror', (e) => errors.push(e.message));
  host.page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  expect(await unlocked(host.page)).toBe(false);

  const phones: Phone[] = [];
  for (const name of ['Ann', 'Ben', 'Cat']) phones.push(await joinPlayer(browser, host, name));
  for (const p of phones) await cameraAndReady(p);

  await host.page.locator('button.sound').click();
  await expect.poll(() => unlocked(host.page)).toBe(true);

  const leader = phones[0]!;
  await leader.page.locator('[data-action=start]').click();
  await expect(screen(leader.page, 'rules')).toBeVisible();
  await leader.page.locator('[data-action=skip]').click();
  await expect.poll(() => hostPhase(host)).toBe('announce');
  const ph = await photographerOf(host, phones);
  await expect(screen(ph.page, 'announce')).toBeVisible();
  await ph.page.getByRole('button', { name: "I'm ready" }).click();
  await expect(screen(ph.page, 'shoot')).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => hostPhase(host), { timeout: 20_000 }).toBe('results');
  expect(errors.filter((e) => !/fonts\.|Failed to load resource/.test(e))).toEqual([]);
});
