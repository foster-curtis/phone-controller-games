// How to play overview (SPEC §6.9): first Start, leader/non-leader controls, host keys, last card,
// lobby re-open, leader handoff, the live {target}, and that a seen room goes straight to the countdown.
import { expect, type Browser, type Page } from '@playwright/test';
import {
  closeContexts,
  joinPhone,
  leaderTap,
  openHost,
  phase,
  screen,
  test,
  type Host,
  type Phone,
} from './helpers';
import { TARGET_SCORES } from '../src/host/match/config';

test.afterEach(closeContexts);
test.setTimeout(120_000);

// Card titles as written in SPEC §6.9, so a copy change is noticed.
const TITLES = [
  'Last egg on the pan',
  'Steer with your thumb',
  'Hold SLAM, then let go',
  'The pan is heating up',
  'Scoring',
  'Come back as a ghost',
];

const rulesState = (host: Host) => host.page.evaluate(() => window.__pcg!.rules());
const card = async (host: Host) => (await rulesState(host))?.card ?? null;
const title = (host: Host) => host.page.locator('.pcg-rules__title');
const body = (host: Host) => host.page.locator('.pcg-rules__body');

async function room(browser: Browser, names: string[]) {
  const host = await openHost(browser);
  const phones: Phone[] = [];
  for (const n of names) phones.push(await joinPhone(browser, host.code, n));
  return { host, phones };
}

/** Taps the leader's Next until the TV is on card index `n`. */
async function advanceTo(host: Host, leader: Phone, n: number) {
  for (let i = (await card(host)) ?? 0; i < n; i++) {
    await leaderTap(leader, 'next');
    await expect.poll(() => card(host)).toBe(i + 1);
  }
}

async function reload(page: Page) {
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.__pcg?.code() ?? null)).toMatch(/^[A-Z]{4}$/);
}

test('first Start opens the overview on the TV and phones; Next advances both', async ({
  browser,
}) => {
  const { host, phones } = await room(browser, ['Ann', 'Bob', 'Cy']);
  const [ann, bob, cy] = phones as [Phone, Phone, Phone];
  await leaderTap(ann, 'start');
  await expect.poll(() => phase(host)).toBe('rules');
  expect(await rulesState(host)).toMatchObject({ card: 0, cards: 6, source: 'firstStart' });
  await expect(host.page.locator('.pcg-rules')).toBeVisible();
  await expect(title(host)).toHaveText(TITLES[0]!);

  for (const p of phones) await expect(screen(p.page, 'rules')).toBeVisible();
  await expect(screen(ann.page, 'rules').locator('[data-leader=next]')).toBeVisible();
  await expect(screen(ann.page, 'rules').locator('[data-leader=skip]')).toBeVisible();
  for (const p of [bob, cy]) {
    await expect(screen(p.page, 'rules')).toContainText('Watch the TV');
    await expect(screen(p.page, 'rules').locator('button')).toHaveCount(0);
  }
  await expect(screen(bob.page, 'rules')).toContainText('Card 1 of 6');

  await leaderTap(ann, 'next');
  await expect.poll(() => card(host)).toBe(1);
  await expect(title(host)).toHaveText(TITLES[1]!);
  await expect(screen(bob.page, 'rules')).toContainText('Card 2 of 6');
  await expect(screen(ann.page, 'rules')).toContainText('Card 2 of 6');

  // Non-leaders have no buttons, so the overview stays put.
  await host.page.waitForTimeout(500);
  expect(await card(host)).toBe(1);
});

test('host keyboard: Enter advances, Esc skips into the countdown', async ({ browser }) => {
  const { host, phones } = await room(browser, ['Ann', 'Bob']);
  await leaderTap(phones[0]!, 'start');
  await expect.poll(() => phase(host)).toBe('rules');
  await host.page.keyboard.press('Enter');
  await expect.poll(() => card(host)).toBe(1);
  await host.page.keyboard.press('Escape');
  await expect.poll(() => phase(host), { timeout: 10_000 }).toBe('countdown');
});

test('last card reads "Let\'s play!" and finishing starts the countdown then play', async ({
  browser,
}) => {
  const { host, phones } = await room(browser, ['Ann', 'Bob']);
  const ann = phones[0]!;
  await leaderTap(ann, 'start');
  await expect.poll(() => phase(host)).toBe('rules');
  await advanceTo(host, ann, 5);
  const next = screen(ann.page, 'rules').locator('[data-leader=next]');
  await expect(next).toHaveText("Let's play!");
  await next.click();
  await expect.poll(() => phase(host), { timeout: 10_000 }).toMatch(/countdown|playing/);
  await expect.poll(() => phase(host), { timeout: 15_000 }).toBe('playing');
});

test('How to play from the lobby returns to the lobby; {target} follows the player count', async ({
  browser,
}) => {
  const { host, phones } = await room(browser, ['Ann', 'Bob']);
  const ann = phones[0]!;

  // Leader's phone button, 2 players: target 15.
  await leaderTap(ann, 'howToPlay');
  await expect.poll(() => phase(host)).toBe('rules');
  expect(await rulesState(host)).toMatchObject({ source: 'lobby' });
  await advanceTo(host, ann, 4);
  await expect(body(host)).toContainText(`First to ${TARGET_SCORES[2]} wins.`);
  await leaderTap(ann, 'skip');
  await expect.poll(() => phase(host)).toBe('lobby');
  await expect(screen(ann.page, 'lobby')).toBeVisible();

  // 3 players: target 13; finishing with Next returns to the lobby.
  const cy = await joinPhone(browser, host.code, 'Cy');
  await expect(screen(cy.page, 'lobby')).toBeVisible();
  await leaderTap(ann, 'howToPlay');
  await expect.poll(() => phase(host)).toBe('rules');
  await advanceTo(host, ann, 4);
  await expect(body(host)).toContainText(`First to ${TARGET_SCORES[3]} wins.`);
  await advanceTo(host, ann, 5);
  await leaderTap(ann, 'next');
  await expect.poll(() => phase(host)).toBe('lobby');
});

test('leader handoff mid-overview moves Next/Skip to the new leader', async ({ browser }) => {
  const { host, phones } = await room(browser, ['Ann', 'Bob', 'Cy']);
  const [ann, bob] = phones as [Phone, Phone, Phone];
  await leaderTap(ann, 'start');
  await expect.poll(() => phase(host)).toBe('rules');
  await ann.context.close();
  const bobRules = screen(bob.page, 'rules');
  await expect(bobRules.locator('[data-leader=next]')).toBeVisible({ timeout: 20_000 });
  await expect(bobRules.locator('[data-leader=skip]')).toBeVisible();
  await leaderTap(bob, 'next');
  await expect.poll(() => card(host)).toBe(1);
  await expect(bobRules).toContainText('Card 2 of 6');
});

test('a room that has seen the overview goes straight to the countdown (host refresh)', async ({
  browser,
}) => {
  // Rematch needs a finished match (several rounds); this covers the same "seen" flag instead: a
  // host refresh mid-overview lands in the lobby and the next Start skips the overview.
  const { host, phones } = await room(browser, ['Ann', 'Bob']);
  const ann = phones[0]!;
  await leaderTap(ann, 'start');
  await expect.poll(() => phase(host)).toBe('rules');
  await reload(host.page);
  await expect.poll(() => phase(host), { timeout: 20_000 }).toBe('lobby');
  const bobLobby = screen(phones[1]!.page, 'lobby');
  await expect(bobLobby).toBeVisible({ timeout: 20_000 });
  // Start needs everyone ready (the Start that opened the overview cleared nobody, but be safe).
  const ready = bobLobby.locator('.ready-btn');
  if ((await ready.getAttribute('data-ready')) !== 'true') await ready.click();
  await expect(ready).toHaveAttribute('data-ready', 'true');
  await leaderTap(ann, 'start');
  await expect.poll(() => phase(host), { timeout: 10_000 }).toBe('countdown');
});
