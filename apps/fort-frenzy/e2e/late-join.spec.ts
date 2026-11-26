// Late join (SPEC §11.2, §15.6; BUILD_PLAN FF14, RD6): a phone that joins during combat sees "Joining
// at the next build phase" → at the next build phase it enters a name, picks the Warden and taps
// Ready → it takes the next slot and spawns at the base with a full build meter and its own card
// pop-up (no cards yet). Sim time is frozen and stepped through `__pcg`.
import { expect } from '@playwright/test';
import {
  advance,
  closeContexts,
  freeze,
  joinPhone,
  newPhoneContext,
  openHost,
  pickKnight,
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
  const bob = await joinPhone(browser, host.code, 'Bob', 'warden');
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
  await pickKnight(cy, 'warden');
  await cy.locator('.screen.lobby .ready').click();

  await expect
    .poll(stepped(host, async () => (await playerByName(host, 'Cy'))?.slot ?? null))
    .toBe(2);
  const p = (await playerByName(host, 'Cy'))!;
  expect(p.alive).toBe(true);
  expect(p.dazed).toBe(false);
  expect(p.classId).toBe('warden');

  // A full meter, its own offer and no cards yet (§11.2, #99): the card pop-up first.
  const meter = (await host.page.evaluate(() => window.__pcg!.meters())).find((m) => m.slot === 2);
  expect(meter).toMatchObject({ build: 'shield_gen', meter: 1, full: true, active: 0 });
  const cards = (await host.page.evaluate(() => window.__pcg!.cards())).find((c) => c.slot === 2)!;
  expect(cards.offer).toHaveLength(3);
  expect(cards.cards).toEqual({});
  await expect(cy.locator('.screen.build')).toBeVisible();
  await expect(cy.locator('.screen.build .upgrade-card')).toHaveCount(3);
  expect(host.errors).toEqual([]);
});
