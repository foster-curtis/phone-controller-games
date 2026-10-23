// Real-browser layout check for the phone play surface at small and large landscape viewports.
// Thumb-reach region (documented): joystick resting center in the left quarter and lower half of the
// viewport; DASH center in the right half and the lower half (y >= 50% of height); SLAM center in the right
// quarter; the SLAM charge arc is at most 2*(gap + max thickness) + stroke larger than the button.
import { expect, test } from '@playwright/test';

for (const [w, h] of [
  [640, 360],
  [932, 430],
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
    // DASH center in the lower half; SLAM right of it; no overlap.
    expect(d.cy).toBeGreaterThanOrEqual(h * 0.5);
    expect(s.x).toBeGreaterThanOrEqual(d.x + d.w - 1);
    // Thumb reach.
    expect(j.cx).toBeLessThanOrEqual(w * 0.35);
    expect(j.cy).toBeGreaterThanOrEqual(h * 0.4);
    expect(d.cx).toBeGreaterThanOrEqual(w * 0.5);
    expect(s.cx).toBeGreaterThanOrEqual(w * 0.75);
    expect(s.y + s.h).toBeLessThanOrEqual(h);
    expect(j.cx).toBeGreaterThan(110);
    expect(h - j.cy).toBeGreaterThan(100);
    if (w === 932) {
      // M5-fix-5 vs M5-fix-4 (DASH 575.5,232.2; SLAM 832,330; stick 119.1,325.4).
      expect(Math.abs(d.cx - 575.5)).toBeLessThanOrEqual(2);
      expect(Math.abs(d.cy - 232.2)).toBeLessThanOrEqual(2);
      expect(Math.abs(s.cx - (832 - 100))).toBeLessThanOrEqual(15);
      expect(Math.abs(s.cy - (330 - 100))).toBeLessThanOrEqual(15);
      expect(Math.abs(j.cx - (119.1 + 100))).toBeLessThanOrEqual(15);
      expect(Math.abs(j.cy - (325.4 - 100))).toBeLessThanOrEqual(15);
      console.log('932x430 centers', { slam: [s.cx, s.cy], stick: [j.cx, j.cy] });
      // Nearest-center split: a touch in DASH's column but nearer SLAM presses SLAM.
      const mx = (d.cx + s.cx) / 2 + 20;
      await page.mouse.move(mx, s.cy);
      await page.mouse.down();
      await expect(page.locator('[data-pad=slam]')).toHaveClass(/pressed/);
      await expect(page.locator('[data-pad=dash]')).not.toHaveClass(/pressed/);
      await page.mouse.up();
    }

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
  });
}
