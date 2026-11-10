// Resume into a new room (SPEC §11.5, §15.8, §15.9; BUILD_PLAN FF14): the TV's room is gone (a
// crashed browser: a new tab with the same localStorage and no host token) → the TV offers Resume in
// a new room and shows its code → a phone rejoining with the same device ID gets its slot back, and
// an unknown phone picks the free slot on the claim screen → Resume → both knights are back.
import { expect } from '@playwright/test';
import {
  advance,
  serveFonts,
  closeContexts,
  freeze,
  joinPhone,
  newPhoneContext,
  openHost,
  readyUp,
  stepUntil,
  test,
  url,
} from './helpers';

test.afterEach(closeContexts);

test('room expired → device-ID match and a claim → resumed run', async ({ browser }) => {
  test.setTimeout(120_000);
  const old = await openHost(browser);
  await freeze(old);
  const ann = await joinPhone(browser, old.code, 'Ann');
  const bob = await joinPhone(browser, old.code, 'Bob');
  await readyUp([ann, bob]);
  await stepUntil(old, { phase: 'build' });
  await old.page.evaluate(() => window.__pcg!.place('arrow_tower', 10, 6, 0));
  await advance(old, 2);
  await expect
    .poll(() => old.page.evaluate(() => window.__pcg!.saved()?.structures.length ?? 0))
    .toBe(1);
  const storage = await old.page.evaluate(() => ({ ...localStorage }));
  await old.context.close();
  // Bob's phone loses its storage: it comes back as an unknown device.
  await bob.context.close();

  // A new TV tab: the snapshot survives in localStorage, the room doesn't.
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await serveFonts(context);
  await context.addInitScript((entries) => {
    for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
  }, storage);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url('/?panel=0&bloom=0&fps=15'));
  await expect
    .poll(() => page.evaluate(() => window.__pcg?.tv().home?.rows[0]?.id ?? null), {
      timeout: 30_000,
    })
    .toBe('resume');
  await expect
    .poll(() => page.evaluate(() => window.__pcg!.code()), { timeout: 20_000 })
    .toMatch(/^[A-Z]{4}$/);
  const code = (await page.evaluate(() => window.__pcg!.code()))!;
  expect(code).not.toBe(old.code);
  await page.evaluate(() => window.__pcg!.speed(0));
  // The TV shows the new code while it waits.
  await expect(page.locator('#tv-ui .homeroom .code')).toHaveText(code);

  // Ann rejoins with the new code: matched to her slot by device ID.
  await ann.page.goto(url(`/play?code=${code}`));
  await expect(ann.page.locator('.screen.status[data-status=restoring]')).toBeVisible();

  // An unknown phone sees the free slot (Bob's) and claims it.
  const phone = await newPhoneContext(browser);
  const stranger = await phone.newPage();
  await stranger.goto(url(`/play?code=${code}`));
  const slot = stranger.locator('.screen.claim .claim-slot');
  await expect(slot).toHaveCount(1);
  await expect(slot).toContainText('Bob');
  await slot.click();
  await expect(stranger.locator('.screen.status[data-status=restoring]')).toBeVisible();

  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => window.__pcg!.phase())).toBe('build');
  await expect(ann.page.locator('.screen.build')).toBeVisible();
  await expect(stranger.locator('.screen.build')).toBeVisible();
  await page.evaluate(() => window.__pcg!.advance(2));
  const roster = await page.evaluate(() => window.__pcg!.players());
  expect(roster.map((p) => [p.name, p.slot, p.dazed])).toEqual([
    ['Ann', 0, false],
    ['Bob', 1, false],
  ]);
  const structures = await page.evaluate(() => window.__pcg!.structures());
  expect(structures.map((s) => [s.kind, s.tile])).toEqual([['arrow_tower', [10, 6]]]);
  expect(errors).toEqual([]);
});
