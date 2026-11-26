// TF7 e2e helpers (BUILD_PLAN §2: a parallel milestone's own helper file): the TV with query params
// (`?timeScale=`, `?overlay=1`), console error capture, the crowd-spike debug hooks, and a phone's
// joystick drag. Host hooks are `window.__pcg` (src/host/debug.ts, debugHooks/).
import type { Browser } from '@playwright/test';
import { blockFonts, expect, TV_VIEWPORT, type Host, type Phone } from './helpers';

export interface SpikeHooks {
  code(): string | null;
  players(): { id: string; name: string }[];
  phase(): 'lobby' | 'opening' | 'play' | 'handsUp';
  world(): { characters: { id: number; x: number; y: number }[] } | null;
  setTimeScale(n: number): void;
  debug(): { liveNpcs: number; plannedNpcs: number } | null;
  characterOf(playerId: string): number | null;
  perf?(): { fps: number; stepMeanMs: number; stepP99Ms: number; characters: number };
}
export type W = { __pcg?: SpikeHooks };

export interface SpikeHost extends Host {
  errors: string[];
}

/** Opens the TV at `/?<query>` and waits for its room code; collects console errors. */
export async function openSpikeHost(browser: Browser, query = ''): Promise<SpikeHost> {
  const context = await browser.newContext({ viewport: TV_VIEWPORT });
  await blockFonts(context);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('console', (m) => {
    // Aborted Google Fonts requests (blockFonts) are not the game's errors.
    if (m.type() === 'error' && !/fonts\.g|ERR_FAILED/.test(m.text() + m.location().url))
      errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`/${query}`);
  await expect
    .poll(() => page.evaluate(() => (window as W).__pcg?.code?.() ?? null), { timeout: 20_000 })
    .toMatch(/^[A-Z]{4}$/);
  const code = (await page.evaluate(() => (window as W).__pcg!.code()))!;
  return { context, page, code, errors };
}

export const phoneId = (phone: Phone) =>
  phone.page.evaluate(() =>
    (window as { __pcg?: { playerId(): string | null } }).__pcg!.playerId(),
  ) as Promise<string>;

/** The phone sends a message through its client (the phone's debug hook). */
export const phoneSend = (phone: Phone, msg: unknown) =>
  phone.page.evaluate(
    (m) => (window as { __pcg?: { send(m: unknown): void } }).__pcg!.send(m),
    msg,
  );

/** Drags the phone's joystick by (dx, dy) px and holds it for `ms`; `during` runs while held. */
export async function holdStick(
  phone: Phone,
  dx: number,
  dy: number,
  ms: number,
  during?: () => Promise<void>,
) {
  const zone = phone.page.locator('.stick-zone');
  const box = (await zone.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await phone.page.mouse.move(x, y);
  await phone.page.mouse.down();
  await phone.page.mouse.move(x + dx, y + dy, { steps: 4 });
  await phone.page.waitForTimeout(ms);
  await during?.();
  await phone.page.mouse.up();
}
