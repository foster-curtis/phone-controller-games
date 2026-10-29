// Render interpolation helpers: draw at lerp(prev, curr, alpha) between two fixed steps.

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Interpolate angles (radians) along the shortest arc; result in (-π, π]. */
export function lerpAngle(a: number, b: number, t: number): number {
  const TAU = Math.PI * 2;
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d <= -Math.PI) d += TAU;
  let r = (a + d * t) % TAU;
  if (r > Math.PI) r -= TAU;
  else if (r <= -Math.PI) r += TAU;
  return r;
}
