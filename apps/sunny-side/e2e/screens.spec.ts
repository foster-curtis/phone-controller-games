// M7 screenshots of the TV: lobby, round, slam, results (with a points breakdown), winner.
// Real brand fonts are allowed here (no font blocking on the host); phones are only drivers.
// Output: e2e/__screens__/{lobby,round,slam,results,winner}.png (+ ghost.png for review).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Browser, type Page } from '@playwright/test';
import {
  eliminate,
  joinPhone,
  type Phone,
  leaderTap,
  phase,
  playerByName,
  startMatch,
  type Host,
  closeContexts,
  test,
} from './helpers';

test.afterEach(closeContexts);

const OUT = join(import.meta.dirname, '__screens__');

async function openTv(browser: Browser): Promise<Host> {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  await page.goto('/');
  await expect
    .poll(() => page.evaluate(() => window.__pcg?.code() ?? null), { timeout: 20_000 })
    .toMatch(/^[A-Z]{4}$/);
  const code = (await page.evaluate(() => window.__pcg!.code()))!;
  return { context, page, code };
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: join(OUT, `${name}.png`) });
}

const alive = (host: Host, id: string) =>
  host.page.evaluate(
    (pid) => window.__pcg!.players().find((p) => p.id === pid)?.alive ?? false,
    id,
  );

test('TV screens: lobby, round, slam, results, winner', async ({ browser }) => {
  test.setTimeout(180_000);
  mkdirSync(OUT, { recursive: true });

  const host = await openTv(browser);
  const phones: Phone[] = [];
  const ann = await joinPhone(browser, host.code, 'Ann');
  phones.push(ann);
  phones.push(await joinPhone(browser, host.code, 'Bartholome'));
  phones.push(await joinPhone(browser, host.code, 'Cy'));
  phones.push(await joinPhone(browser, host.code, 'Dee'));
  const a = await playerByName(host, 'Ann');
  const b = await playerByName(host, 'Bartholome');
  const c = await playerByName(host, 'Cy');
  const d = await playerByName(host, 'Dee');
  await host.page.evaluate(() => document.fonts.ready);
  await host.page.waitForTimeout(600);
  await shot(host.page, 'lobby');

  await startMatch(host, ann);
  await host.page.waitForTimeout(800);
  await shot(host.page, 'round');

  // Slam: Bartholome charges (ring fills, egg squashes, yolk heats).
  expect(await host.page.evaluate((id) => window.__pcg!.debug.holdSlam(id, true), b.id)).toBe(true);
  await host.page.waitForTimeout(900);
  await shot(host.page, 'slam');
  await host.page.evaluate((id) => window.__pcg!.debug.holdSlam(id, false), b.id);

  // A credited knockout, then wait for Cy's ghost to appear for a ghost shot.
  const knock = async (victim: string, by: string) => {
    if (!(await alive(host, victim))) return;
    expect(
      await host.page.evaluate(([v, k]) => window.__pcg!.debug.knockOut(v!, k!), [victim, by]),
    ).toBe(true);
    await expect.poll(() => alive(host, victim), { timeout: 20_000 }).toBe(false);
  };
  await knock(c.id, a.id);
  await host.page.waitForTimeout(5600);
  await shot(host.page, 'ghost');

  await knock(d.id, a.id);
  await eliminate(host, b.id);
  await expect.poll(() => phase(host), { timeout: 20_000 }).toBe('results');
  await host.page.waitForTimeout(500);
  expect(await host.page.evaluate(() => window.__pcg!.view().breakdown?.players.length)).toBe(4);
  await shot(host.page, 'results');

  // More rounds until the match ends (Ann keeps winning); the last round has a credited KO too.
  for (let round = 0; round < 12 && (await phase(host)) !== 'matchEnd'; round++) {
    await leaderTap(ann, 'next');
    await expect.poll(() => phase(host), { timeout: 15_000 }).toBe('playing');
    await knock(d.id, a.id);
    await eliminate(host, b.id);
    await eliminate(host, c.id);
    await expect.poll(() => phase(host), { timeout: 20_000 }).toMatch(/results|matchEnd/);
  }
  expect(await phase(host)).toBe('matchEnd');
  await host.page.waitForTimeout(500);
  await shot(host.page, 'winner');

  // Leave nothing running for the next spec.
  for (const p of phones) await p.context.close();
  await host.context.close();
});
