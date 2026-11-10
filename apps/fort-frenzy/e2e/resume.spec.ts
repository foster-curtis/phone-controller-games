// Host reload and resume (SPEC §11.5, §15.8, §15.9; BUILD_PLAN FF14): mid-build, the TV reloads →
// it reclaims the same room, the phones stay joined and show "TV is restoring…" → Resume (Enter on
// the TV, focused first) → the same wave's build phase with the same structures and cards. Sim time
// is frozen and stepped through `__pcg`; the snapshot autosaves on the TV's own timer.
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

test('TV reload mid-build → Resume → same wave, structures and cards', async ({ browser }) => {
  test.setTimeout(120_000);
  const host = await openHost(browser);
  await freeze(host);
  const ann = await joinPhone(browser, host.code, 'Ann');
  const bob = await joinPhone(browser, host.code, 'Bob');
  await readyUp([ann, bob]);
  await stepUntil(host, { phase: 'build' });

  // Build-phase changes: two structures and a card pick.
  await host.page.evaluate(() => {
    const api = window.__pcg!;
    api.place('arrow_tower', 10, 6, 0);
    api.place('wall', 24, 6, 1);
    const offer = api.cards()[0]!.offer!;
    api.command({ c: 'card', slot: 0, card: offer[0]! });
  });
  await advance(host, 2);
  const before = await host.page.evaluate(() => ({
    wave: window.__pcg!.wave(),
    structures: window.__pcg!.structures(),
    cards: window.__pcg!.cards(),
  }));
  expect(before.structures.length).toBe(2);
  expect(Object.keys(before.cards[0]!.cards).length).toBe(1);
  // The debounced save has caught up (§15.8: ≤ 250 ms after a change).
  await expect
    .poll(() => host.page.evaluate(() => window.__pcg!.saved()?.structures.length ?? 0))
    .toBe(2);

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
  const after = await host.page.evaluate(() => ({
    wave: window.__pcg!.wave(),
    structures: window.__pcg!.structures().map((s) => ({ kind: s.kind, tile: s.tile })),
    cards: window.__pcg!.cards(),
  }));
  expect(after.wave).toBe(before.wave);
  expect(after.structures).toEqual(before.structures.map((s) => ({ kind: s.kind, tile: s.tile })));
  expect(after.cards).toEqual(before.cards);

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
