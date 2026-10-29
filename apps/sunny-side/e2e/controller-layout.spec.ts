// Real-browser layout check for the phone play surface at small and large landscape viewports.
// Thumb band (M5-fix-7): every control center (resting stick, DASH, SLAM, ghost PULSE) is at most
// THUMB_BAND px above the bottom edge on any viewport; DASH sits above SLAM and left of it.
import { expect } from '@playwright/test';
import { test } from './helpers';

const THUMB_BAND = 280;

for (const [w, h] of [
  [640, 360],
  [932, 430],
  [1180, 820],
  [1366, 1024],
] as const) {
  test(`controller layout ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/play.html?dev=1');
    const dash = page.locator('[data-pad=dash] .pad-btn');
    const slam = page.locator('[data-pad=slam] .pad-btn');
    const stick = page.locator('.stick-base');
    await expect(dash).toBeVisible();
    await expect(stick).toBeVisible();
    const box = async (l: typeof dash) => {
      const b = (await l.boundingBox())!;
      return {
        x: b.x,
        y: b.y,
        w: b.width,
        h: b.height,
        cx: b.x + b.width / 2,
        cy: b.y + b.height / 2,
      };
    };
    const d = await box(dash);
    const s = await box(slam);
    const j = await box(stick);
    // Thumb band: every control center within THUMB_BAND of the bottom edge.
    for (const c of [d, s, j]) expect(h - c.cy).toBeLessThanOrEqual(THUMB_BAND);
    // DASH is slightly higher than SLAM and left of it; no overlaps.
    expect(d.cy).toBeLessThan(s.cy);
    expect(d.cy).toBeGreaterThan(s.cy - s.h);
    expect(d.cx).toBeLessThan(s.cx);
    expect(s.x - (d.x + d.w)).toBeGreaterThanOrEqual(16);
    expect(d.x).toBeGreaterThanOrEqual(w / 2); // not over the stick half
    expect(j.cx + j.w / 2).toBeLessThan(d.x);
    expect(s.y + s.h).toBeLessThanOrEqual(h);
    expect(d.y).toBeGreaterThanOrEqual(0);
    expect(j.cx).toBeLessThanOrEqual(w * 0.35);
    expect(j.cx).toBeGreaterThan(110);
    expect(h - j.cy).toBeGreaterThan(100);
    expect(s.cx).toBeGreaterThanOrEqual(w * 0.75);
    console.log(`${w}x${h} centers`, {
      dash: [d.cx, d.cy],
      slam: [s.cx, s.cy],
      stick: [j.cx, j.cy],
    });
    if (w === 932) {
      // M5-fix-6: SLAM ~(732,275); stick ~(219,271) (unchanged by M5-fix-7).
      expect(Math.abs(s.cx - 732)).toBeLessThanOrEqual(10);
      expect(Math.abs(s.cy - 275)).toBeLessThanOrEqual(10);
      expect(Math.abs(j.cx - 219)).toBeLessThanOrEqual(10);
      expect(Math.abs(j.cy - 271)).toBeLessThanOrEqual(10);
      // Nearest-center split: a touch in DASH's column but nearer SLAM presses SLAM.
      const mx = (d.cx + s.cx) / 2 + 20;
      await page.mouse.move(mx, s.cy);
      await page.mouse.down();
      await expect(page.locator('[data-pad=slam]')).toHaveClass(/pressed/);
      await expect(page.locator('[data-pad=dash]')).not.toHaveClass(/pressed/);
      await page.mouse.up();
    }

    // A touch on DASH's center presses DASH only.
    await page.mouse.move(d.cx, d.cy);
    await page.mouse.down();
    await expect(page.locator('[data-pad=dash]')).toHaveClass(/pressed/);
    await expect(page.locator('[data-pad=slam]')).not.toHaveClass(/pressed/);
    await page.mouse.up();

    // Hold SLAM to full charge; the arc hugs the button.
    await page.mouse.move(s.cx, s.cy);
    await page.mouse.down();
    await page.waitForTimeout(1200);
    const arc = (await page.locator('[data-pad=slam] .arc-wedge').boundingBox())!;
    const maxExtra = 2 * (8 + 0.2 * 60) + 3; // 2*(gap + max thickness) + stroke
    expect(arc.width).toBeLessThanOrEqual(s.w + maxExtra);
    expect(arc.height).toBeLessThanOrEqual(s.h + maxExtra);
    await page.screenshot({ path: `e2e/__screens__/controller-${w}.png` });
    // The full-charge arc keeps >= 16 px from DASH.
    const gapX = arc.x - (d.x + d.w);
    const gapY = d.y - (arc.y + arc.height);
    const gapY2 = arc.y - (d.y + d.h);
    expect(Math.max(gapX, gapY, gapY2)).toBeGreaterThanOrEqual(16);
    await page.mouse.up();

    // Ghost PULSE sits where SLAM is (also within the band).
    await page.mouse.move(0, 0);
    await page.evaluate(() => (document.querySelector('.dev-toggle') as HTMLElement).click());
    await page.locator('[data-dev-screen=ghost]').click();
    const pulse = await box(page.locator('[data-pad=pulse] .pad-btn'));
    expect(h - pulse.cy).toBeLessThanOrEqual(THUMB_BAND);
    expect(Math.abs(pulse.cx - s.cx)).toBeLessThanOrEqual(2);
    expect(Math.abs(pulse.cy - s.cy)).toBeLessThanOrEqual(2);
  });
}
