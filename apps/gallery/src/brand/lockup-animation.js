/*
 * The lockup's controller animation.
 *
 * At rest the lockup is the main site's mark + wordmark, then a divider and a
 * muted "games" label. On page load, on hover and every two minutes, the mark
 * turns into a phone controller, plays a short scripted bit, and turns back:
 *
 *   0–450ms     Transform: the square stretches into a landscape phone, the
 *               amber center shrinks into the joystick nub, the stick ring
 *               fades in and two action buttons pop in. The text slides right
 *               to make room.
 *   450–1350    Steer left: glide left with the stick pushed left, pause,
 *               tilt -8°, tap the lower button.
 *   1350–2450   Steer right: swing across, tilt +8°, double-tap the upper
 *               button.
 *   2450–3300   Center and jump: settle level, press both buttons with a hop.
 *   3300–3900   Fold back into the original mark.
 *
 * Constraints this is built around:
 *   - Under 5s, so auto-playing motion needs no pause control (WCAG 2.2.2).
 *   - Transforms and SVG attributes only. The text moves with `transform`,
 *     never layout, so it adds nothing to CLS.
 *   - prefers-reduced-motion: never plays. The static lockup is the design;
 *     the animation is a bonus.
 *   - The timer skips while the tab is hidden.
 *
 * Markup it expects (see README):
 *   .brand-lockup
 *     svg.brand-mark-morph  (.m-all > .m-ring, .m-stick, .m-inner, .m-b1, .m-b2)
 *     .brand-lockup-text    (wordmark, divider, "games")
 */

const TOTAL = 3900;
const REPEAT_MS = 120_000;
const FIRST_PLAY_MS = 600;
/** How far the text slides while the controller is out, in mark units (64 = mark width). */
const TEXT_SHIFT = 30;

const inOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const out = (t) => 1 - Math.pow(1 - t, 3);

/** Keyframe track: [timeMs, value, easing?][]; easing applies to the segment ending at that key. */
function track(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [a, va] = keys[i - 1];
    const [b, vb, ease = inOut] = keys[i];
    if (t <= b) return va + (vb - va) * ease((t - a) / (b - a));
  }
  return keys[keys.length - 1][1];
}

/** 0→1→0 over `len` ms from each start time: a button press. */
function press(starts, t, len = 150) {
  for (const s of starts) if (t >= s && t < s + len) return Math.sin(((t - s) / len) * Math.PI);
  return 0;
}

const MORPH = [[0, 0], [450, 1], [3300, 1], [3900, 0]];
const SLIDE_X = [[450, 0], [800, -6, out], [1350, -6], [1750, 6], [2450, 6], [2850, 0]];
const TILT = [[800, 0], [1000, -8, out], [1350, -8], [1750, 0], [1950, 8, out], [2450, 8], [2850, 0]];
const STICK_X = [[450, 0], [650, -3.5, out], [1350, -3.5], [1650, 3.5], [2450, 3.5], [2750, 0]];
const HOP = [[2950, 0], [3050, -4, out], [3200, 0]];
const PRESS_LOWER = [1150, 3000];
const PRESS_UPPER = [2050, 2250, 3000];

// Geometry in the mark's 64×64 viewBox. Start = the brand mark; end = controller.
// The controller grows out from the mark's center (both sides), so the text only
// has to move half as far and narrow headers keep room for the toggle.
const RING = { from: [6, 6, 52, 52, 12], to: [-17, 12, 98, 40, 11] };
const INNER = { from: [24, 24, 16, 16, 4], to: [3.5, 27.5, 9, 9, 4.5] };
const BUTTON_R = 5.5;
const RECT_ATTRS = ["x", "y", "width", "height", "rx"];

function draw(svg, t) {
  const p = track(MORPH, t);
  const lerp = (g, k) => g.from[k] + (g.to[k] - g.from[k]) * p;
  const stickX = track(STICK_X, t) * p;

  RECT_ATTRS.forEach((attr, k) => {
    svg.querySelector(".m-ring").setAttribute(attr, lerp(RING, k));
    svg.querySelector(".m-inner").setAttribute(attr, lerp(INNER, k) + (k === 0 ? stickX : 0));
  });
  svg.querySelector(".m-stick").setAttribute("opacity", Math.max(0, (p - 0.5) * 2));
  svg.querySelector(".m-b1").setAttribute("r", BUTTON_R * p * (1 - 0.35 * press(PRESS_LOWER, t)));
  svg.querySelector(".m-b2").setAttribute("r", BUTTON_R * p * (1 - 0.35 * press(PRESS_UPPER, t)));
  svg
    .querySelector(".m-all")
    .setAttribute(
      "transform",
      `translate(${track(SLIDE_X, t)} ${track(HOP, t)}) rotate(${track(TILT, t)} 32 32)`,
    );
  return p;
}

function play(lockup) {
  if (lockup.dataset.playing) return;
  const svg = lockup.querySelector(".brand-mark-morph");
  const text = lockup.querySelector(".brand-lockup-text");
  if (!svg || !text) return;

  lockup.dataset.playing = "true";
  // offsetWidth, not getBoundingClientRect: ignores any CSS scale on ancestors.
  const unit = svg.parentElement.offsetWidth / 64;
  const start = performance.now();

  const frame = (now) => {
    const t = Math.min(TOTAL, now - start);
    const p = draw(svg, t);
    text.style.transform = `translateX(${TEXT_SHIFT * unit * p}px)`;
    if (t < TOTAL) {
      requestAnimationFrame(frame);
    } else {
      draw(svg, 0);
      text.style.transform = "";
      delete lockup.dataset.playing;
    }
  };
  requestAnimationFrame(frame);
}

/** Call once after the DOM is ready. Safe to call when there is no lockup. */
export function initLockupAnimation(root = document) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const lockups = [...root.querySelectorAll(".brand-lockup")];
  if (!lockups.length) return;

  lockups.forEach((lockup) => lockup.addEventListener("mouseenter", () => play(lockup)));
  const playAll = () => {
    if (!document.hidden) lockups.forEach(play);
  };
  setTimeout(playAll, FIRST_PLAY_MS);
  setInterval(playAll, REPEAT_MS);
}
