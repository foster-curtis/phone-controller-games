// TF1 art gallery (SPEC §6.21, BUILD_PLAN TF1): `/?gallery=1&debug=1` renders every page with no
// console errors (fonts blocked) and no fallback shapes, and saves screenshots for C1/C7 review.
// The glance and confetti pages also save a second, later screenshot (motion over time).
import { expect, test } from './helpers';
import { balance } from '../src/content';
import { plannedNpcs } from '../src/host/sim/npc/churn';

// TF1-fix-1 adds the staged glance, the occupied stocks and the confetti pages; TF1-fix-2 makes the
// glance page a grid of glances aimed at a thief.
const PAGES = [
  'citizen',
  'merchant',
  'guard',
  'glance',
  'stalls',
  'items',
  'stocks',
  'effects',
  'confetti',
  'stress',
] as const;

interface Probe {
  ready: boolean;
  page: string;
  fallbacks: number;
  missing: string[];
  rigs: number;
  fps?: number;
}

test.use({ viewport: { width: 1920, height: 1080 } });

for (const page of PAGES) {
  test(`gallery page ${page} renders with no errors or fallbacks`, async ({ page: tab }) => {
    const errors: string[] = [];
    tab.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    tab.on('pageerror', (e) => errors.push(String(e)));
    await tab.goto(`/?gallery=1&debug=1&atlas=1&page=${page}`);
    await expect
      .poll(() => tab.evaluate(() => (window as { __pcgGallery?: Probe }).__pcgGallery ?? null), {
        timeout: 30_000,
      })
      .toMatchObject({ ready: true, page });
    // Let clips, effects and the crowd run a little.
    await tab.waitForTimeout(page === 'stress' ? 2500 : 1200);
    const probe = (await tab.evaluate(
      () => (window as { __pcgGallery?: Probe }).__pcgGallery!,
    )) as Probe;
    expect(probe.missing).toEqual([]);
    expect(probe.fallbacks).toBe(0);
    // TF1-fix-2: merchant and citizen × 4 body facings × 4 targets × caught/clear.
    if (page === 'glance') expect(probe.rigs).toBe(2 * 4 * 4 * 2);
    if (page === 'stress') {
      // 8 players + their planned NPCs (from balance), 4 guards, 10 merchants.
      expect(probe.rigs).toBe(8 + plannedNpcs(8, balance) + 4 + 10);
      expect(probe.fps ?? 0).toBeGreaterThan(0);
    }
    // Fonts are blocked offline; their failed requests are not app errors.
    expect(errors.filter((e) => !/fonts\.(googleapis|gstatic)|ERR_FAILED/.test(e))).toEqual([]);
    await expect(tab.locator('#gallery-nav a')).toHaveCount(PAGES.length);
    await tab.screenshot({ path: `e2e/__screens__/tf1-gallery-${page}.png` });
    if (page === 'glance' || page === 'confetti') {
      // The glance grid: a later shot lands on the look / ending stages.
      await tab.waitForTimeout(page === 'glance' ? 1800 : 1300);
      await tab.screenshot({ path: `e2e/__screens__/tf1-gallery-${page}-later.png` });
      const later = (await tab.evaluate(
        () => (window as { __pcgGallery?: Probe }).__pcgGallery!,
      )) as Probe;
      expect(later.fallbacks).toBe(0);
    }
  });
}
