// Smoke: lobby QR + code → phones join → leader Start → elimination → ghost → results → Next.
import { expect, test } from '@playwright/test';
import { create as createQr } from 'qrcode';
import {
  eliminate,
  hostTexts,
  joinPhone,
  leaderTap,
  openHost,
  phase,
  playerByName,
  screen,
  startMatch,
  closeContexts,
} from './helpers';

test.afterEach(closeContexts);

test('host lobby → round → ghost → results → next round', async ({ browser, baseURL }) => {
  const host = await openHost(browser);
  expect(host.code).toMatch(/^[A-Z]{4}$/);

  // The lobby shows the code and a QR that encodes `${origin}/play?code=CODE`.
  const origin = new URL(baseURL!).origin;
  const url = `${origin}/play?code=${host.code}`;
  await expect.poll(() => hostTexts(host)).toContain(host.code);
  expect(await host.page.evaluate(() => window.__pcg!.joinUrl())).toBe(url);
  await expect.poll(() => host.page.evaluate(() => window.__pcg!.qr())).not.toBeNull();
  const drawn = (await host.page.evaluate(() => window.__pcg!.qr()))!;
  const expected = createQr(url, { errorCorrectionLevel: 'M' }).modules;
  expect(drawn.size).toBe(expected.size);
  expect(drawn.modules).toEqual(Array.from(expected.data, (v) => (v ? 1 : 0)));

  // Two players join by the QR's URL and submit names; the host lobby lists both.
  const ann = await joinPhone(browser, host.code, 'Ann');
  const bob = await joinPhone(browser, host.code, 'Bob');
  await expect
    .poll(async () => (await hostTexts(host)).join('\n'))
    .toMatch(/Ann[\s\S]*Bob|Bob[\s\S]*Ann/);

  // The first to join leads: Start on Ann's phone, "Waiting for" on Bob's.
  await expect(ann.page.locator('[data-leader=start]')).toBeVisible();
  await expect(bob.page.locator('[data-leader=start]')).toHaveCount(0);
  await expect(screen(bob.page, 'lobby')).toContainText('Waiting for Ann');

  // A third egg keeps round 1 alive after Bob's ring-out (with 2 eggs, one ring-out ends the round).
  const cy = await joinPhone(browser, host.code, 'Cy');
  await expect.poll(async () => (await hostTexts(host)).join('\n')).toContain('Cy');

  await startMatch(host, ann);
  await expect(screen(ann.page, 'playing')).toBeVisible();
  await expect(screen(bob.page, 'playing')).toBeVisible();

  const p2 = await playerByName(host, 'Bob');
  expect(await eliminate(host, p2.id)).toBe(true);
  await expect(screen(bob.page, 'eliminated')).toBeVisible();
  await expect(screen(bob.page, 'ghost')).toBeVisible({ timeout: 6_000 });

  // Ring out Cy too: Ann is the sole survivor and the round ends.
  const p3 = await playerByName(host, 'Cy');
  expect(await eliminate(host, p3.id)).toBe(true);
  await expect.poll(() => phase(host)).toBe('results');
  await expect(screen(ann.page, 'results')).toBeVisible();
  await expect(screen(bob.page, 'results')).toBeVisible();
  await expect(screen(cy.page, 'results')).toBeVisible();
  await expect(screen(bob.page, 'results')).toContainText('Waiting for Ann');

  // Leader Next → round 2.
  await leaderTap(ann, 'next');
  await expect.poll(() => phase(host), { timeout: 10_000 }).toBe('playing');
  expect(await host.page.evaluate(() => window.__pcg!.view().round)).toBe(2);
  await expect(screen(ann.page, 'playing')).toBeVisible();
  await expect(screen(bob.page, 'playing')).toBeVisible();
});
