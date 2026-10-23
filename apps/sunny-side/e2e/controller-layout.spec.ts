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
    // DASH center in the lower half; SLAM lower than DASH (stagger) and right of it; no overlap.
    expect(d.cy).toBeGreaterThanOrEqual(h * 0.5);
    expect(s.cy).toBeGreaterThan(d.cy);
    expect(s.x).toBeGreaterThanOrEqual(d.x + d.w - 1);
    // Thumb reach.
    expect(j.cx).toBeLessThanOrEqual(w * 0.25);
    expect(j.cy).toBeGreaterThanOrEqual(h * 0.5);
    expect(d.cx).toBeGreaterThanOrEqual(w * 0.5);
    expect(s.cx).toBeGreaterThanOrEqual(w * 0.75);
    expect(s.y + s.h).toBeLessThanOrEqual(h);
    // Stick nudged ~28 px up/right of the old corner (old center: 88 px from left, 80 px from the bottom).
    expect(j.cx).toBeGreaterThan(110);
    expect(h - j.cy).toBeGreaterThan(100);

    // Hold SLAM to full charge; the arc hugs the button.
    await page.mouse.move(s.cx, s.cy);
    await page.mouse.down();
    await page.waitForTimeout(1200);
    const arc = (await page.locator('[data-pad=slam] .arc-wedge').boundingBox())!;
    const maxExtra = 2 * (8 + 0.2 * 60) + 3; // 2*(gap + max thickness) + stroke
    expect(arc.width).toBeLessThanOrEqual(s.w + maxExtra);
    expect(arc.height).toBeLessThanOrEqual(s.h + maxExtra);
    await page.screenshot({ path: `e2e/__screens__/controller-${w}.png` });
    await page.mouse.up();
  });
}
