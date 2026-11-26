// Smoke (SPEC §15.9; RD6): the slice end to end from one phone. TV home → room → a phone joins and
// picks the Warden → Ready starts the run alone (§11.1, #100) → the wave 1 card pop-up (Ready before
// confirming: the phase's end picks a card, §10.2) → combat of wave 1: portals flare, the Warden
// drags his lit build button (the TV previews the throw), releases, and a shield generator flies out
// and lands; the meter empties and the button dims → wave 1 clears → wave 2's pop-up: select a card,
// Confirm → the shop (a purchase) → Ready → combat of wave 2. Sim time is frozen and stepped through
// `__pcg`, so nothing depends on wall time or the TV's frame rate.
import { expect } from '@playwright/test';
import {
  advance,
  closeContexts,
  confirmCard,
  freeze,
  holdBuildAim,
  joinPhone,
  openHost,
  players,
  readyUp,
  stats,
  stepped,
  stepUntil,
  test,
} from './helpers';

test.afterEach(closeContexts);

test('solo Warden: start alone → wave 1 → shield generator → card → shop → wave 2', async ({
  browser,
  baseURL,
}) => {
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

  // One phone, the Warden; she leads, and Ready alone starts the run.
  const ann = await joinPhone(browser, host.code, 'Ann', 'warden');
  await expect
    .poll(async () => (await players(host)).map((p) => [p.name, p.classId]))
    .toEqual([['Ann', 'warden']]);
  await expect(ann.page.locator('.leader-box')).toBeVisible();
  await readyUp([ann]);
  await stepUntil(host, { phase: 'build', wave: 1 });

  // The card pop-up: three cards, no stick, no tabs. Ready before confirming: the phase's end picks.
  await expect(ann.page.locator('.screen.build .upgrade-card')).toHaveCount(3);
  await expect(ann.page.locator('.screen.build [data-tab], .screen.build .tabs')).toHaveCount(0);
  await host.page.screenshot({ path: 'e2e/__screens__/smoke-build.png' });
  await ann.page.locator('.screen.build .ready').click();
  await stepUntil(host, { phase: 'combat', wave: 1 }, 1);
  const owned = async () =>
    Object.values((await host.page.evaluate(() => window.__pcg!.cards()))[0]!.cards).reduce(
      (n, k) => n + (k ?? 0),
      0,
    );
  expect(await owned()).toBe(1);

  // Combat: portals flare ahead of their groups (the hot side never reaches the phones).
  await expect(ann.page.locator('.screen.combat')).toBeVisible();
  // The first pulse lands somewhere in its slice of the wave (seconds in), so step inside the page
  // until a portal flares (one round trip), not a few steps per poll.
  const flared = await host.page.evaluate(() => {
    const api = window.__pcg!;
    const lit = () => api.portals().portals.some((p) => p.flaring);
    for (let ran = 0; !lit() && ran < 60 * 60; ran += 5) api.advance(5);
    return lit();
  });
  expect(flared).toBe(true);
  expect(await host.page.evaluate(() => window.__pcg!.portals().hot)).not.toBeNull();
  await host.page.evaluate(() =>
    window.__pcg!.command({ c: 'debug', slot: -1, action: 'invincible', on: true }),
  );

  // The meter starts full: the build button is lit. Drag it: the TV previews the throw.
  const meter = () => host.page.evaluate(() => window.__pcg!.meters()[0]!);
  expect(await meter()).toMatchObject({ build: 'shield_gen', full: true, active: 0 });
  const release = await holdBuildAim(ann, -50);
  await expect
    .poll(stepped(host, () => host.page.evaluate(() => window.__pcg!.preview(0)), 1))
    .not.toBeNull();
  const preview = (await host.page.evaluate(() => window.__pcg!.preview(0)))!;
  expect(preview.kind).toBe('shield_gen');
  expect(preview.landing.x).toBeLessThan(preview.from.x);
  await host.page.screenshot({ path: 'e2e/__screens__/smoke-aim.png' });

  // Release: a shield generator flies out, the meter empties and the button dims.
  await release();
  await expect
    .poll(stepped(host, () => host.page.evaluate(() => window.__pcg!.builds().length), 1))
    .toBe(1);
  const build = (await host.page.evaluate(() => window.__pcg!.builds()))[0]!;
  expect(build).toMatchObject({ kind: 'shield_gen', owner: 0 });
  expect((await meter()).full).toBe(false);
  await expect(ann.page.locator('.screen.combat .round-btn.action')).toHaveClass(/dimmed/);
  // The clock is frozen: step a fixed, ample count once (a full-range throw flies 72 steps at
  // THROW_SPEED, RC2) instead of polling, so machine load can't change how many steps run.
  await advance(host, 300);
  expect(await host.page.evaluate(() => window.__pcg!.builds()[0]?.state)).not.toBe('flight');
  await host.page.screenshot({ path: 'e2e/__screens__/smoke-build-landed.png' });

  // Wave 1 clears into the build phase of wave 2: select a card, Confirm, then the shop.
  await stepUntil(host, { phase: 'build', wave: 2 }, 300);
  await confirmCard(ann);
  await expect.poll(stepped(host, owned)).toBe(2);
  await expect(ann.page.locator('.shop-row[data-item=repair]')).toBeVisible();
  await expect(ann.page.locator('.shop-row[data-item=base_hp]')).toBeVisible();
  // Income is low on purpose (RD11, §6.2): nothing is affordable this early, so the TV's debug
  // command pays for the purchase.
  await host.page.evaluate(() =>
    window.__pcg!.command({ c: 'debug', slot: -1, action: 'coins', amount: 20 }),
  );
  await advance(host, 1);
  const price = await host.page.evaluate(
    () => window.__pcg!.team()!.shop.find((r) => r.id === 'base_hp')!.price!,
  );
  const coins0 = (await stats(host)).coins;
  await ann.page.locator('.shop-row[data-item=base_hp] .price').click();
  await expect.poll(stepped(host, async () => (await stats(host)).coins)).toBe(coins0 - price);

  // Ready: combat of wave 2.
  await ann.page.locator('.screen.build .ready').click();
  await stepUntil(host, { phase: 'combat', wave: 2 }, 1);
  await expect(ann.page.locator('.screen.combat')).toBeVisible();
  expect(await host.page.evaluate(() => window.__pcg!.fallbacks())).toBe(0);
  await host.page.screenshot({ path: 'e2e/__screens__/smoke-wave2.png' });
  expect(host.errors).toEqual([]);
});
