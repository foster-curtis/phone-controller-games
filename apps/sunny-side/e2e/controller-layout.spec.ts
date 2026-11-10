// Real-browser layout check for the phone play surface at small and large landscape viewports.
// Thumb band (M5-fix-7): every control center (resting stick, SLAM, ghost PULSE) is at most
// THUMB_BAND px above the bottom edge on any viewport. DASH is hidden (SPEC #31), so SLAM's zone
// takes the whole right half.
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
    const slam = page.locator('[data-pad=slam] .pad-btn');
    const stick = page.locator('.stick-base');
    await expect(slam).toBeVisible();
    await expect(stick).toBeVisible();
    await expect(page.locator('[data-pad=dash]')).toBeHidden();
    const box = async (l: typeof slam) => {
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
    const s = await box(slam);
    const j = await box(stick);
    // Thumb band: every control center within THUMB_BAND of the bottom edge.
    for (const c of [s, j]) expect(h - c.cy).toBeLessThanOrEqual(THUMB_BAND);
    expect(j.cx + j.w / 2).toBeLessThan(w / 2);
    expect(s.y + s.h).toBeLessThanOrEqual(h);
    expect(j.cx).toBeLessThanOrEqual(w * 0.35);
    expect(j.cx).toBeGreaterThan(110);
    expect(h - j.cy).toBeGreaterThan(100);
    expect(s.cx).toBeGreaterThanOrEqual(w * 0.75);
    console.log(`${w}x${h} centers`, {
      slam: [s.cx, s.cy],
      stick: [j.cx, j.cy],
    });
    if (w === 932) {
      // M5-fix-6: SLAM ~(732,275); stick ~(219,271) (unchanged by M5-fix-7).
      expect(Math.abs(s.cx - 732)).toBeLessThanOrEqual(10);
      expect(Math.abs(s.cy - 275)).toBeLessThanOrEqual(10);
      expect(Math.abs(j.cx - 219)).toBeLessThanOrEqual(10);
      expect(Math.abs(j.cy - 271)).toBeLessThanOrEqual(10);
    }

    // With DASH hidden, a touch anywhere in the right half presses SLAM: try the zone's top-left
    // corner, farthest from the button (y = 20 would land on the top banner, not the pads).
    const zone = (await page.locator('[data-pad=slam]').boundingBox())!;
    expect(zone.x).toBeLessThanOrEqual(w / 2 + 1);
    await page.mouse.move(zone.x + 10, zone.y + 10);
    await page.mouse.down();
    await expect(page.locator('[data-pad=slam]')).toHaveClass(/pressed/);
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
