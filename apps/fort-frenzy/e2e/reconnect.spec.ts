// Reconnect (SPEC §11.3, §15.9; BUILD_PLAN FF7): a phone drops mid-run → its knight is dazed and
// the TV shows it disconnected → the phone comes back in a new browser with the same player key
// and device ID → the same slot, with the same color and class. Sim time is frozen and stepped
// through `__pcg` (presence changes apply on a step), so nothing waits on wall time.
import { expect } from '@playwright/test';
import {
  closeContexts,
  freeze,
  joinPhone,
  newPhoneContext,
  openHost,
  players,
  readyUp,
  stepped,
  stepUntil,
  url,
  test,
} from './helpers';

test.afterEach(closeContexts);

test('phone drop → dazed → back in the same slot', async ({ browser }) => {
  test.setTimeout(90_000);
  const host = await openHost(browser);
  await freeze(host);
  const ann = await joinPhone(browser, host.code, 'Ann');
  const bob = await joinPhone(browser, host.code, 'Bob');

  // Ann takes rose in the lobby (the color intent).
  await ann.page.locator('.screen.lobby [data-color=rose]').click();
  await expect
    .poll(async () => (await players(host)).find((p) => p.name === 'Ann')?.color)
    .toBe('rose');
  await readyUp([ann, bob]);
  await stepUntil(host, { phase: 'build' });
  const before = (await players(host)).find((p) => p.name === 'Ann')!;
  expect(before.slot).toBe(0);

  // Drop: Ann's phone goes away. The knight stays, dazed (translucent, disconnected on the TV).
  const storage = await ann.page.evaluate(() => ({ ...localStorage }));
  await ann.context.close();
  await expect
    .poll(stepped(host, async () => (await players(host)).find((p) => p.name === 'Ann')?.dazed))
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
  await page.goto(url(`/play?code=${host.code}`));
  await expect(page.locator('.screen.build')).toBeVisible();
  await expect
    .poll(stepped(host, async () => (await players(host)).find((p) => p.name === 'Ann')?.dazed))
    .toBe(false);
  const after = (await players(host)).find((p) => p.name === 'Ann')!;
  expect(after.playerId).not.toBe(before.playerId);
  expect(after.slot).toBe(before.slot);
  expect(after.color).toBe('rose');
  expect(after.classId).toBe('engineer');
  expect((await players(host)).length).toBe(2);
  expect(host.errors).toEqual([]);
});
