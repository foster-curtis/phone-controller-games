// Smoke (SPEC §15.9; RD2): TV home → room → two phones join (the Ranger) → both ready → countdown →
// build phase (the shop view: no Build tab, no supply items; a card pick and a purchase) → combat of
// wave 1 (the build button is there, dimmed; a Drone dies, coins rise) → on to combat of wave 2. Sim time is frozen and stepped through `__pcg`, so nothing
// depends on wall time or the TV's frame rate.
import { expect } from '@playwright/test';
import {
  closeContexts,
  freeze,
  joinPhone,
  openHost,
  players,
  readyUp,
  stats,
  stepped,
  stepUntil,
  stepUntilKill,
  test,
} from './helpers';

test.afterEach(closeContexts);

test('lobby → class select → start → shop → combat to wave 2', async ({ browser, baseURL }) => {
  test.setTimeout(150_000);
  const host = await openHost(browser);
  await freeze(host);

  // The lobby's join URL is this origin's /play?code=CODE; canvas and overlay share one fit.
  const origin = new URL(baseURL!).origin;
  expect(await host.page.evaluate(() => window.__pcg!.joinUrl())).toBe(
    `${origin}/play?code=${host.code}`,
  );
  await expect.poll(() => host.page.evaluate(() => window.__pcg!.screen())).toBe('lobby');
  const boxes = await host.page.evaluate(() => {
    const b = window.__pcg!.boxes();
    return { c: b.canvas?.toJSON() as DOMRect, o: b.overlay?.toJSON() as DOMRect };
  });
  for (const k of ['x', 'y', 'width', 'height'] as const)
    expect(boxes.c[k]).toBeCloseTo(boxes.o[k], 0);

  const ann = await joinPhone(browser, host.code, 'Ann');
  const bob = await joinPhone(browser, host.code, 'Bob');
  await expect
    .poll(async () => (await players(host)).map((p) => [p.name, p.classId]))
    .toEqual([
      ['Ann', 'ranger'],
      ['Bob', 'ranger'],
    ]);
  // The first to join leads: Start is on Ann's phone only.
  await expect(ann.page.locator('.leader-box')).toBeVisible();
  await expect(bob.page.locator('.leader-box')).toBeHidden();

  await readyUp([ann, bob]);
  await stepUntil(host, { phase: 'build' });
  // The build phase is the shop view: no tabs, no Build tab, no supply items.
  const shop = ann.page.locator('.screen.build');
  await expect(shop).toBeVisible();
  await expect(bob.page.locator('.screen.build')).toBeVisible();
  await expect(ann.page.locator('.screen.build [data-tab], .screen.build .tabs')).toHaveCount(0);
  await expect(ann.page.locator('.kit-tile, .give')).toHaveCount(0);

  // The card pop-up first (when a hand is dealt): tap a card, Confirm; then the shop.
  const card = ann.page.locator('.screen.build .upgrade-card').first();
  if (await card.isVisible()) {
    await card.click();
    await ann.page.locator('.screen.build .confirm').click();
  }
  await expect(ann.page.locator('.shop-row[data-item=repair]')).toBeVisible();
  await expect(ann.page.locator('.shop-row[data-item=base_hp]')).toBeVisible();

  // The cheapest buy the starting coins allow (base max HP, 6).
  const coins0 = (await stats(host)).coins;
  await ann.page.locator('.shop-row[data-item=base_hp] .price').click();
  await expect.poll(stepped(host, async () => (await stats(host)).coins)).toBe(coins0 - 6);
  await host.page.screenshot({ path: 'e2e/__screens__/smoke-build.png' });

  // Both ready: combat of wave 1.
  for (const p of [ann, bob]) await p.page.locator('.screen.build .ready').click();
  await stepUntil(host, { phase: 'combat', wave: 1 }, 1);
  await expect(ann.page.locator('.screen.combat')).toBeVisible();
  // The build button: there, dimmed (the Ranger's mines can't be placed until RD7).
  await expect(ann.page.locator('.screen.combat .round-btn.action')).toBeVisible();
  const combatCoins = (await stats(host)).coins;

  // Ann drags the main attack (the aim line shows on the TV), then releases: a shot.
  const shots0 = (await stats(host)).shots;
  await ann.page.mouse.move(675, 265);
  await ann.page.mouse.down();
  await ann.page.mouse.move(705, 235, { steps: 4 });
  await ann.page.mouse.move(735, 205, { steps: 4 });
  await expect
    .poll(stepped(host, () => host.page.evaluate(() => window.__pcg!.players()[0]!.aiming), 1))
    .toBe(true);
  await host.page.screenshot({ path: 'e2e/__screens__/smoke-aim.png' });
  await ann.page.mouse.up();
  await expect
    .poll(stepped(host, async () => (await stats(host)).shots, 1))
    .toBeGreaterThan(shots0);
  await host.page.evaluate(() =>
    window.__pcg!.command({ c: 'debug', slot: -1, action: 'invincible', on: true }),
  );

  // A Drone dies (Ann, the sentries) and pays coins.
  await stepUntilKill(host);
  expect((await stats(host)).coins).toBeGreaterThan(combatCoins);

  // Wave 1 clears into the build phase of wave 2, then combat of wave 2.
  await stepUntil(host, { phase: 'combat', wave: 2 }, 300);
  await expect(bob.page.locator('.screen.combat')).toBeVisible();
  expect(await host.page.evaluate(() => window.__pcg!.fallbacks())).toBe(0);
  await host.page.screenshot({ path: 'e2e/__screens__/smoke-wave2.png' });
  expect(host.errors).toEqual([]);
});
