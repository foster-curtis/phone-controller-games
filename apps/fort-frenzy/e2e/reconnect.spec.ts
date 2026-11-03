// Reconnect (SPEC §11.3, §15.9; BUILD_PLAN FF7): a phone drops mid-run → its knight is dazed and
// the TV shows it disconnected → the phone comes back in a new browser with the same player key
// and device ID → the same slot, with the same color and class.
import { expect } from '@playwright/test';
import {
  closeContexts,
  joinPhone,
  newPhoneContext,
  openHost,
  phase,
  players,
  readyUp,
  test,
} from './helpers';

test.afterEach(closeContexts);

test('phone drop → dazed → back in the same slot', async ({ browser }) => {
  test.setTimeout(90_000);
  const host = await openHost(browser);
  const ann = await joinPhone(browser, host.code, 'Ann');
  const bob = await joinPhone(browser, host.code, 'Bob');

  // Ann takes rose in the lobby (the color intent).
  await ann.page.locator('.screen.lobby [data-color=rose]').click();
  await expect
    .poll(async () => (await players(host)).find((p) => p.name === 'Ann')?.color)
    .toBe('rose');
  await readyUp([ann, bob]);
  await expect.poll(() => phase(host), { timeout: 15_000 }).toBe('build');
  const before = (await players(host)).find((p) => p.name === 'Ann')!;
  expect(before.slot).toBe(0);

  // Drop: Ann's phone goes away. The knight stays, dazed (translucent, disconnected on the TV).
  const storage = await ann.page.evaluate(() => ({ ...localStorage }));
  await ann.context.close();
  await expect
    .poll(async () => (await players(host)).find((p) => p.name === 'Ann')?.dazed)
    .toBe(true);
  await expect
    .poll(() =>
      host.page.evaluate(
        () => window.__pcg!.team()?.roster.find((r) => r.name === 'Ann')?.connected,
      ),
    )
    .toBe(false);
  expect((await players(host)).find((p) => p.name === 'Ann')?.slot).toBe(0);

  // Back: a new browser with the same player key and device ID.
  const context = await newPhoneContext(browser, storage);
  const page = await context.newPage();
  await page.goto(`/play?code=${host.code}`);
  await expect(page.locator('.screen.build')).toBeVisible();
  await expect
    .poll(async () => (await players(host)).find((p) => p.name === 'Ann')?.dazed)
    .toBe(false);
  const after = (await players(host)).find((p) => p.name === 'Ann')!;
  expect(after.playerId).not.toBe(before.playerId);
  expect(after.slot).toBe(before.slot);
  expect(after.color).toBe('rose');
  expect(after.classId).toBe('engineer');
  expect((await players(host)).length).toBe(2);
  expect(host.errors).toEqual([]);
});
