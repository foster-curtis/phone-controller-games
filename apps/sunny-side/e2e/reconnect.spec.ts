// Reconnect: a reload mid-round rejoins with the same playerId; a player who comes back after the
// relay window (2 s in e2e) with the same player key spectates with their score restored.
import { expect, test } from '@playwright/test';
import {
  eliminate,
  joinPhone,
  leaderTap,
  newPhoneContext,
  openHost,
  phase,
  playerByName,
  players,
  screen,
  startMatch,
} from './helpers';

const PLAYER_RECONNECT_MS = 2000;

test('reload mid-round keeps the id; late rejoin by key restores the score', async ({
  browser,
}) => {
  const host = await openHost(browser);
  const ann = await joinPhone(browser, host.code, 'Ann');
  const bob = await joinPhone(browser, host.code, 'Bob');
  await playerByName(host, 'Bob');

  // Round 1: Ann rings out, Bob survives (+3).
  await startMatch(host, ann);
  const annId = (await playerByName(host, 'Ann')).id;
  expect(await eliminate(host, annId)).toBe(true);
  await expect.poll(() => phase(host)).toBe('results');
  const bobBefore = await playerByName(host, 'Bob');
  expect(bobBefore.score).toBe(3);

  // Round 2: Bob reloads mid-round → same playerId, playing again.
  await leaderTap(ann, 'next');
  await expect.poll(() => phase(host), { timeout: 10_000 }).toBe('playing');
  await expect(screen(bob.page, 'playing')).toBeVisible();
  const root = bob.page.locator('#app');
  await expect(root).toHaveAttribute('data-player-id', bobBefore.id);

  await bob.page.reload();
  await expect(screen(bob.page, 'playing')).toBeVisible();
  await expect(root).toHaveAttribute('data-player-id', bobBefore.id);
  await expect
    .poll(async () => (await players(host)).find((p) => p.id === bobBefore.id)?.connected)
    .toBe(true);
  expect((await players(host)).length).toBe(2);

  // Bob leaves for longer than the relay window, then returns in a new browser (same key).
  const keyName = `pcg:playerKey:sunny-side:${host.code}`;
  const playerKey = await bob.page.evaluate((k) => localStorage.getItem(k), keyName);
  expect(playerKey).toBeTruthy();
  await bob.context.close();
  await expect
    .poll(async () => (await players(host)).find((p) => p.id === bobBefore.id)?.connected)
    .toBe(false);
  await new Promise((r) => setTimeout(r, PLAYER_RECONNECT_MS + 1000));

  const context = await newPhoneContext(browser, { [keyName]: playerKey! });
  const page = await context.newPage();
  await page.goto(`/play?code=${host.code}`);
  await expect(screen(page, 'spectating')).toBeVisible();
  await expect(screen(page, 'spectating')).toContainText('Bob');

  const back = await playerByName(host, 'Bob');
  expect(back.id).not.toBe(bobBefore.id);
  expect(back.score).toBe(3);
  expect(back.spectating).toBe(true);
});
