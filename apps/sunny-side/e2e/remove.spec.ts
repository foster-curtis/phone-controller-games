// TV removal (M7-fix-2): an away player is dimmed on the TV; clicking its × twice (arm, confirm)
// removes it, so the lobby lists 2 players and a new phone gets the freed color.
import { expect, test } from '@playwright/test';
import { closeContexts, joinPhone, openHost, players, screen } from './helpers';

test.afterEach(closeContexts);

test('TV remove control frees an away player’s spot and color', async ({ browser }) => {
  const host = await openHost(browser);
  await joinPhone(browser, host.code, 'Ann');
  const bob = await joinPhone(browser, host.code, 'Bob');
  await joinPhone(browser, host.code, 'Cy');
  await expect.poll(async () => (await players(host)).filter((p) => p.name).length).toBe(3);
  const bobPlayer = (await players(host)).find((p) => p.name === 'Bob')!;
  const bobColor = bobPlayer.color;

  // Bob closes the tab: shows away on the TV.
  await bob.context.close();
  await expect
    .poll(async () => (await players(host)).find((p) => p.id === bobPlayer.id)?.connected)
    .toBe(false);
  await expect.poll(() => host.page.evaluate(() => window.__pcg!.texts())).toContain('Away');

  const buttons = () => host.page.evaluate(() => window.__pcg!.removeButtons());
  await expect.poll(async () => (await buttons()).length).toBe(3);
  const target = (await buttons()).find((b) => b.playerId === bobPlayer.id)!;
  const x = target.x + target.w / 2;
  const y = target.y + target.h / 2;

  // Click 1 arms the × ("Remove?"), click 2 confirms. The TV can be slow on a loaded box, so the
  // pair is retried (only while Bob is still there) instead of waiting on the 3 s window.
  for (let pair = 0; pair < 3 && (await players(host)).length === 3; pair++) {
    await host.page.mouse.click(x, y);
    await host.page.waitForTimeout(300);
    await host.page.mouse.click(x, y);
    await expect
      .poll(async () => (await players(host)).length, { timeout: 8000 })
      .toBe(2)
      .catch(() => undefined);
  }

  await expect
    .poll(async () => (await players(host)).map((p) => p.name).sort())
    .toEqual(['Ann', 'Cy']);

  // A new phone joins and takes a free color (Bob's is free again).
  const dee = await joinPhone(browser, host.code, 'Dee');
  await expect(screen(dee.page, 'lobby')).toBeVisible();
  await expect.poll(async () => (await players(host)).length).toBe(3);
  const deeColor = (await players(host)).find((p) => p.name === 'Dee')!.color;
  expect(deeColor).toBe(bobColor);
});
