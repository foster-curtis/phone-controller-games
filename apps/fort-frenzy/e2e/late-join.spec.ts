// Late join (SPEC §11.2, §15.6; BUILD_PLAN FF14): a phone that joins during combat sees "Joining at
// the next build phase" → at the next build phase it enters a name, picks a knight and taps Ready →
// it takes the next slot and spawns at the base. Sim time is frozen and stepped through `__pcg`.
import { expect } from '@playwright/test';
import {
  advance,
  closeContexts,
  freeze,
  joinPhone,
  newPhoneContext,
  openHost,
  playerByName,
  readyUp,
  stepped,
  stepUntil,
  test,
  url,
} from './helpers';

test.afterEach(closeContexts);

test('a phone joining in combat waits, then joins at the build phase', async ({ browser }) => {
  test.setTimeout(120_000);
  const host = await openHost(browser);
  await freeze(host);
  const ann = await joinPhone(browser, host.code, 'Ann');
  const bob = await joinPhone(browser, host.code, 'Bob');
  await readyUp([ann, bob]);
  await stepUntil(host, { phase: 'build' });
  await host.page.evaluate(() => {
    for (const slot of [0, 1]) window.__pcg!.command({ c: 'ready', slot, ready: true });
  });
  await advance(host, 2);
  await stepUntil(host, { phase: 'combat' });

  // Cy arrives mid-wave: the waiting screen, no knight in the run.
  const context = await newPhoneContext(browser);
  const cy = await context.newPage();
  await cy.goto(url(`/play?code=${host.code}`));
  await expect(cy.locator('.screen.status[data-status=waiting]')).toBeVisible();
  expect(await playerByName(host, 'Cy')).toBeNull();
  expect((await host.page.evaluate(() => window.__pcg!.players())).length).toBe(3);

  // The next build phase opens late joins.
  await host.page.evaluate(() =>
    window.__pcg!.command({ c: 'debug', slot: -1, action: 'jumpWave', wave: 2 }),
  );
  await stepUntil(host, { phase: 'build', wave: 2 });
  await cy.getByLabel('Your name').fill('Cy');
  await cy.getByRole('button', { name: 'JOIN' }).click();
  const pick = cy.locator('.screen.lobby .pick');
  await expect(pick).toBeVisible();
  await pick.click();
  await cy.locator('.screen.lobby .ready').click();

  await expect
    .poll(stepped(host, async () => (await playerByName(host, 'Cy'))?.slot ?? null))
    .toBe(2);
  await expect(cy.locator('.screen.build')).toBeVisible();
  const p = (await playerByName(host, 'Cy'))!;
  expect(p.alive).toBe(true);
  expect(p.dazed).toBe(false);
  expect(host.errors).toEqual([]);
});
