// Host reload and resume (SPEC §11.5, §15.8, §15.9; BUILD_PLAN FF14, RD14): mid-build, the TV reloads
// → it reclaims the same room, the phones stay joined and show "TV is restoring…" → Resume (Enter on
// the TV, focused first) → the same wave's build phase with the same builds (a mine, a shield
// generator and Bob's rally flag), meters, cards and Bob's squad: the restored run saves the same
// snapshot it was restored from. Sim time is frozen and stepped through `__pcg`; the snapshot
// autosaves on the TV's own timer.
import { expect } from '@playwright/test';
import {
  advance,
  closeContexts,
  freeze,
  joinPhone,
  openHost,
  readyUp,
  stepUntil,
  test,
} from './helpers';

test.afterEach(closeContexts);

test('TV reload mid-build → Resume → same wave, builds, meters, cards and squad', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const host = await openHost(browser);
  await freeze(host);
  const ann = await joinPhone(browser, host.code, 'Ann');
  const bob = await joinPhone(browser, host.code, 'Bob', 'commander');
  await readyUp([ann, bob]);
  await stepUntil(host, { phase: 'build' });

  // Build-phase changes: builds (placed through the debug API: none can be placed in a build
  // phase), Bob's flag, and a card pick.
  await host.page.evaluate(() => {
    const api = window.__pcg!;
    api.addBuild('mine', 10.5, 6.5, 0);
    api.addBuild('shield_gen', 24.5, 6.5, 0);
    api.addBuild('rally_flag', 18.5, 12.5, 1);
    const offer = api.cards()[0]!.offer!;
    api.command({ c: 'card', slot: 0, card: offer[0]! });
  });
  await advance(host, 2);
  const read = () =>
    host.page.evaluate(() => ({
      wave: window.__pcg!.wave(),
      builds: window.__pcg!.builds().map((b) => [b.kind, b.x, b.y, b.hp, b.maxHp, b.owner]),
      meters: window.__pcg!.meters(),
      cards: window.__pcg!.cards(),
    }));
  const before = await read();
  expect(before.builds.length).toBe(3);
  expect(Object.keys(before.cards[0]!.cards).length).toBe(1);
  // The debounced save has caught up (§15.8: ≤ 250 ms after a change).
  await expect
    .poll(() => host.page.evaluate(() => window.__pcg!.saved()?.builds.length ?? 0))
    .toBe(3);
  const saved = (await host.page.evaluate(() => window.__pcg!.saved()))!;
  expect(saved.slots.map((s) => s.meter)).toEqual([1, 1]);
  expect(saved.slots[1]!.squad?.soldiers).toHaveLength(2);

  // Reload: the TV offers Resume (focused) and reclaims the same room.
  await host.page.reload();
  await expect
    .poll(() => host.page.evaluate(() => window.__pcg?.tv().home?.rows[0]?.id ?? null), {
      timeout: 30_000,
    })
    .toBe('resume');
  await expect.poll(() => host.page.evaluate(() => window.__pcg!.code())).toBe(host.code);
  await freeze(host);
  for (const p of [ann, bob])
    await expect(p.page.locator('.screen.status[data-status=restoring]')).toBeVisible();

  await host.page.keyboard.press('Enter');
  await expect.poll(() => host.page.evaluate(() => window.__pcg!.phase())).toBe('build');
  expect(await read()).toEqual(before);
  // The restored run saves the snapshot it came from (the clock aside).
  const strip = (s: typeof saved) => ({ ...s, savedAt: 0, runMs: 0 });
  await expect
    .poll(async () => {
      const now = await host.page.evaluate(() => window.__pcg!.saved());
      return now && now.savedAt !== saved.savedAt ? strip(now) : null;
    })
    .toEqual(strip(saved));

  // The phones are back in the build phase, connected.
  for (const p of [ann, bob]) await expect(p.page.locator('.screen.build')).toBeVisible();
  await advance(host, 2);
  const roster = await host.page.evaluate(() => window.__pcg!.players());
  expect(roster.map((p) => [p.name, p.slot, p.dazed])).toEqual([
    ['Ann', 0, false],
    ['Bob', 1, false],
  ]);
  expect(host.errors).toEqual([]);
});
